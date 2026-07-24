/**
 * FightMatrix.com — algorithmic MMA fighter ratings.
 *
 * FightMatrix uses an Elo-like rating system that:
 * - Updates after every fight result
 * - Weights quality of opposition (beating top-10 > beating unranked)
 * - Provides peer-reviewed ratings across all promotions
 *
 * This is useful because it gives an unbiased algorithmic ranking
 * independent of the UFC's subjective ranking committee.
 *
 * Caches to disk for 12 hours.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BASE = "http://www.fightmatrix.com";

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/fightmatrix"
);
const CACHE_TTL = 12 * 60 * 60 * 1000;

export interface FightMatrixData {
  name: string;
  rating: number | null;
  rank: number | null;
  weightClass: string | null;
  peakRating: number | null;
  wins: number;
  losses: number;
}

function cacheKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function readCache(name: string): FightMatrixData | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeCache(name: string, data: FightMatrixData) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(name)}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

async function searchFighter(name: string): Promise<string | null> {
  // FightMatrix URL format: /mma-fighter-profile/First-Last/ID/
  const q = encodeURIComponent(name);
  const lastName = name.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  try {
    const html = await axios.get<string>(`${BASE}/?s=${q}`, {
      headers: { "User-Agent": UA },
      timeout: 8000,
      responseType: "text",
    }).then(r => r.data);
    const $ = cheerio.load(html);

    // Score all candidate links — prefer ones whose URL slug contains last name
    let bestLink: string | null = null;
    let bestScore = -1;
    $('a[href*="/mma-fighter-profile/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const slugScore = href.toLowerCase().replace(/[^a-z]/g, "").includes(lastName) ? 1 : 0;
      if (slugScore > bestScore) { bestScore = slugScore; bestLink = href; }
    });

    if (bestScore < 1) {
      logger.debug({ name }, "FightMatrix: no slug last-name match — skipping");
      return null;
    }
    return bestLink;
  } catch { return null; }
}

export async function getFightMatrixData(fighterName: string): Promise<FightMatrixData | null> {
  const cached = readCache(fighterName);
  if (cached) return cached;

  try {
    const profileUrl = await searchFighter(fighterName);
    if (!profileUrl) return null;

    const url = profileUrl.startsWith("http") ? profileUrl : `${BASE}${profileUrl}`;
    const html = await axios.get<string>(url, {
      headers: { "User-Agent": UA },
      timeout: 10000,
      responseType: "text",
    }).then(r => r.data);

    const $ = cheerio.load(html);
    const text = $("body").text();

    // Extract rating from page text
    const ratingM = text.match(/(?:Current Rating|FMRating)[:\s]+(\d+)/i);
    const rankM = text.match(/(?:Rank|Position)[:\s]+#?(\d+)/i);
    const wlM = text.match(/(\d+)\s*-\s*(\d+)/);
    const wcM = text.match(/(?:Weight Class|Division)[:\s]+([A-Za-z\s]+(?:weight|weight class))/i);
    const peakM = text.match(/(?:Peak|Highest)[:\s]+(\d+)/i);

    const data: FightMatrixData = {
      name: fighterName,
      rating: ratingM ? parseInt(ratingM[1], 10) : null,
      rank: rankM ? parseInt(rankM[1], 10) : null,
      weightClass: wcM ? wcM[1].trim() : null,
      peakRating: peakM ? parseInt(peakM[1], 10) : null,
      wins: wlM ? parseInt(wlM[1], 10) : 0,
      losses: wlM ? parseInt(wlM[2], 10) : 0,
    };

    writeCache(fighterName, data);
    logger.info({ fighterName, rating: data.rating }, "FightMatrix data fetched");
    return data;
  } catch (err) {
    logger.debug({ err, fighterName }, "FightMatrix fetch failed");
    return null;
  }
}

export function formatFightMatrixContext(data: FightMatrixData): string | null {
  const lines: string[] = [];
  if (data.rating) lines.push(`FightMatrix algorithmic rating: ${data.rating}${data.peakRating ? ` (peak: ${data.peakRating})` : ""}`);
  if (data.rank) lines.push(`Algorithmic rank: #${data.rank}${data.weightClass ? ` at ${data.weightClass}` : ""}`);
  if (!lines.length) return null;
  return lines.join("\n");
}
