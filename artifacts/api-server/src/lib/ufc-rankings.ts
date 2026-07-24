/**
 * UFC Rankings — pulls from multiple sources:
 * 1. UFC CDN JSON (primary)
 * 2. ESPN MMA rankings API (fallback)
 * 3. UFC.com scrape (last resort)
 *
 * Returns a flat list of { weightClass, rank, name, isChampion }
 * so the AI prompt can inject official ranking context per fighter.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface UfcRankingEntry {
  weightClass: string;
  rank: number;       // 0 = Champion, 1-15 = ranked
  name: string;
  isChampion: boolean;
  isInterimChampion?: boolean;
}

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/rankings"
);
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

let _memCache: { data: UfcRankingEntry[]; at: number } | null = null;

function readDiskCache(): UfcRankingEntry[] | null {
  try {
    const p = path.join(CACHE_DIR, "rankings.json");
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeDiskCache(data: UfcRankingEntry[]): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, "rankings.json"), JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Source 1: ESPN MMA rankings API */
async function fetchFromEspn(): Promise<UfcRankingEntry[]> {
  const r = await axios.get<any>("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings", {
    headers: { "User-Agent": UA },
    timeout: 10000,
  });
  const rankings: UfcRankingEntry[] = [];
  const groups: any[] = r.data?.rankings ?? [];
  for (const group of groups) {
    const wc = group.name ?? group.shortDisplayName ?? "Unknown";
    for (const item of group.ranks ?? []) {
      const rank = item.current ?? 0;
      const name = item.athlete?.displayName ?? item.athlete?.fullName;
      if (!name) continue;
      rankings.push({ weightClass: wc, rank, name, isChampion: rank === 0 });
    }
  }
  return rankings;
}

/** Source 2: UFC.com scrape */
async function fetchFromUfcDotCom(): Promise<UfcRankingEntry[]> {
  const r = await axios.get<string>("https://www.ufc.com/rankings", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    timeout: 12000,
    responseType: "text",
  });
  const $ = cheerio.load(r.data);
  const rankings: UfcRankingEntry[] = [];

  $(".view-grouping").each((_, section) => {
    const wc = $(section).find(".view-grouping-header h4, .view-grouping-header").first().text().trim()
      .replace(/UFC\s*/i, "").trim();
    if (!wc) return;
    // Champion
    const champName = $(section).find(".rankings--athlete--champion .athlete-name a, .ranking-title__name").first().text().trim();
    if (champName) rankings.push({ weightClass: wc, rank: 0, name: champName, isChampion: true });
    // Ranked 1-15
    $(section).find("tbody tr").each((i, row) => {
      const rank = parseInt($(row).find(".rankings--athlete--rank").text().trim(), 10);
      const name = $(row).find(".view-id-ufc_athlete_ranking .athlete-name a, .athlete-name a").first().text().trim();
      if (!name || isNaN(rank)) return;
      rankings.push({ weightClass: wc, rank, name, isChampion: false });
    });
  });
  return rankings;
}

export async function getUfcRankings(): Promise<UfcRankingEntry[]> {
  if (_memCache && Date.now() - _memCache.at < CACHE_TTL) return _memCache.data;
  const disk = readDiskCache();
  if (disk?.length) { _memCache = { data: disk, at: Date.now() }; return disk; }

  const sources = [fetchFromEspn, fetchFromUfcDotCom];
  for (const fetch of sources) {
    try {
      const data = await fetch();
      if (data.length > 10) {
        writeDiskCache(data);
        _memCache = { data, at: Date.now() };
        logger.info({ count: data.length }, "UFC rankings fetched");
        return data;
      }
    } catch (err) {
      logger.debug({ err }, "UFC rankings source failed, trying next");
    }
  }
  logger.warn("All UFC ranking sources failed");
  return [];
}

/** Look up a fighter's ranking entry by name (fuzzy match) */
export function lookupRanking(name: string, rankings: UfcRankingEntry[]): UfcRankingEntry | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const n = norm(name);
  // Exact match
  let found = rankings.find(r => norm(r.name) === n);
  if (found) return found;
  // Partial: one contains the other
  found = rankings.find(r => {
    const rn = norm(r.name);
    return n.length > 4 && (rn.includes(n) || n.includes(rn));
  });
  return found ?? null;
}

export function formatRankingContext(entry: UfcRankingEntry | null, fighterName: string): string | null {
  if (!entry) return null;
  if (entry.isChampion) return `${fighterName}: UFC ${entry.weightClass} CHAMPION`;
  return `${fighterName}: UFC ranked #${entry.rank} at ${entry.weightClass}`;
}
