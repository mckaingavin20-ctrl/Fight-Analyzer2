/**
 * Tapology.com fighter data scraper.
 * Tapology has the most comprehensive MMA fighter records including:
 * - Training camp / gym affiliation
 * - Nationality  
 * - Full fight history including regional shows
 * - Media scores and consensus picks for past fights
 * - Fighter rankings across multiple sanctioning bodies
 *
 * Caches to disk for 24 hours.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://www.tapology.com";

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/tapology"
);
const CACHE_TTL = 24 * 60 * 60 * 1000;

export interface TapologyFighterData {
  name: string;
  gym: string | null;
  nationality: string | null;
  hometown: string | null;
  record: { wins: number; losses: number; draws: number; nc: number } | null;
  weightClass: string | null;
  height: string | null;
  reach: string | null;
  stance: string | null;
  proDebut: string | null;
  ranking: string | null;
  recentFights: Array<{
    result: string;
    opponent: string;
    event: string;
    method: string;
    round: string;
    date: string;
  }>;
}

function cacheKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function readCache(name: string): TapologyFighterData | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeCache(name: string, data: TapologyFighterData) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(name)}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

async function get(url: string): Promise<string> {
  const r = await axios.get<string>(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.tapology.com/",
    },
    timeout: 12000,
    responseType: "text",
  });
  return r.data;
}

async function searchFighter(name: string): Promise<string | null> {
  const query = encodeURIComponent(name);
  const html = await get(`${BASE}/search?term=${query}&type=fighters`);
  const $ = cheerio.load(html);

  // Find fighter links in search results
  const links: string[] = [];
  $('a[href*="/fightcenter/fighters/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.includes("/fightcenter/fighters/")) links.push(href);
  });

  // Return first valid profile link (not the search page itself)
  return links.find(l => l.match(/\/fighters\/\d+-/)) ?? null;
}

function parseProfile(html: string): Partial<TapologyFighterData> {
  const $ = cheerio.load(html);
  const result: Partial<TapologyFighterData> = {};

  result.name = $("h1.mainText").first().text().trim() ||
    $(".fighterUpcomingHeader h1, h1").first().text().trim();

  // Details section
  const details: Record<string, string> = {};
  $(".details .details__field, .bio_fighter .bio__field").each((_, el) => {
    const label = $(el).find(".details__label, .bio__label").text().trim().toLowerCase();
    const value = $(el).find(".details__value, .bio__value").text().trim();
    if (label && value) details[label] = value;
  });

  // Alternative: parse table rows
  $("ul.clearfix li, .fighterDetails li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const parts = text.split(":");
    if (parts.length >= 2) {
      details[parts[0].toLowerCase().trim()] = parts.slice(1).join(":").trim();
    }
  });

  result.gym = details["gym"] ?? details["camp"] ?? details["team"] ?? null;
  result.nationality = details["nationality"] ?? details["country"] ?? null;
  result.hometown = details["hometown"] ?? details["birth place"] ?? null;
  result.height = details["height"] ?? null;
  result.reach = details["reach"] ?? null;
  result.stance = details["stance"] ?? null;
  result.weightClass = details["weight class"] ?? details["weight"] ?? null;
  result.proDebut = details["pro debut"] ?? details["debut"] ?? null;
  result.ranking = details["ranking"] ?? null;

  // Record
  const recordText = $(".fighterRecord, .record").first().text().trim();
  const rm = recordText.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (rm) {
    result.record = {
      wins: parseInt(rm[1], 10),
      losses: parseInt(rm[2], 10),
      draws: parseInt(rm[3] ?? "0", 10),
      nc: 0,
    };
  }

  // Fight history
  result.recentFights = [];
  $("table.table tr, .fightCard tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length < 4) return;
    const resultText = $(tds[0]).text().trim().toUpperCase();
    if (!["WIN", "LOSS", "DRAW", "NC", "W", "L", "D"].includes(resultText)) return;
    result.recentFights!.push({
      result: resultText === "WIN" || resultText === "W" ? "W" : resultText === "LOSS" || resultText === "L" ? "L" : resultText,
      opponent: $(tds[1]).text().trim(),
      event: $(tds[2]).text().trim(),
      method: $(tds[3]).text().trim(),
      round: $(tds[4])?.text().trim() ?? "",
      date: $(tds[5])?.text().trim() ?? $(tds[4])?.text().trim() ?? "",
    });
  });

  return result;
}

export async function getTapologyData(fighterName: string): Promise<TapologyFighterData | null> {
  const cached = readCache(fighterName);
  if (cached) return cached;

  try {
    const profileUrl = await searchFighter(fighterName);
    if (!profileUrl) {
      logger.debug({ fighterName }, "Tapology: fighter not found");
      return null;
    }

    const profileHtml = await get(`${BASE}${profileUrl.startsWith("http") ? profileUrl.replace(BASE, "") : profileUrl}`);
    const data = parseProfile(profileHtml);

    const result: TapologyFighterData = {
      name: data.name ?? fighterName,
      gym: data.gym ?? null,
      nationality: data.nationality ?? null,
      hometown: data.hometown ?? null,
      record: data.record ?? null,
      weightClass: data.weightClass ?? null,
      height: data.height ?? null,
      reach: data.reach ?? null,
      stance: data.stance ?? null,
      proDebut: data.proDebut ?? null,
      ranking: data.ranking ?? null,
      recentFights: data.recentFights ?? [],
    };

    writeCache(fighterName, result);
    logger.info({ fighterName, gym: result.gym, nationality: result.nationality }, "Tapology data fetched");
    return result;
  } catch (err) {
    logger.debug({ err, fighterName }, "Tapology fetch failed (site may block bots)");
    return null;
  }
}

export function formatTapologyContext(data: TapologyFighterData): string {
  const lines: string[] = [];
  if (data.gym) lines.push(`Training camp: ${data.gym}`);
  if (data.nationality) lines.push(`Nationality: ${data.nationality}`);
  if (data.hometown) lines.push(`Hometown: ${data.hometown}`);
  if (data.weightClass) lines.push(`Weight class: ${data.weightClass}`);
  if (data.proDebut) lines.push(`Pro debut: ${data.proDebut}`);
  if (data.ranking) lines.push(`Ranking: ${data.ranking}`);
  if (data.reach) lines.push(`Reach: ${data.reach}`);
  if (data.stance) lines.push(`Stance: ${data.stance}`);
  if (data.record) {
    lines.push(`Tapology record: ${data.record.wins}-${data.record.losses}${data.record.draws > 0 ? `-${data.record.draws}` : ""}`);
  }
  if (data.recentFights.length > 0) {
    lines.push("Recent fights (Tapology):");
    data.recentFights.slice(0, 6).forEach(f => {
      lines.push(`  [${f.result}] vs ${f.opponent} — ${f.method} (${f.date})`);
    });
  }
  return lines.join("\n");
}
