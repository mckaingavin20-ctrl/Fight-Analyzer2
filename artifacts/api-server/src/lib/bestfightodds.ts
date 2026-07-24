/**
 * BestFightOdds.com — historical closing line odds & ATS (against the spread) record.
 *
 * This data tells us:
 * - How a fighter has historically performed vs their closing market price
 * - Whether they consistently beat expectations (good sign) or disappoint (bad sign)
 * - Historical odds for past fights, showing how the market was calibrated
 *
 * Key insight: a fighter who consistently outperforms their closing line odds
 * is showing real value; one who underperforms is trending down.
 *
 * Caches to disk for 12 hours.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://www.bestfightodds.com";

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/bestfightodds"
);
const CACHE_TTL = 12 * 60 * 60 * 1000;

export interface BfoFightOdds {
  opponent: string;
  result: string;    // W / L
  openLine: string;  // opening American odds (e.g. -150)
  closeLine: string; // closing American odds
  date: string;
}

export interface BfoFighterData {
  name: string;
  fights: BfoFightOdds[];
  atsRecord: string | null;  // e.g. "8-4 ATS (67% beat closing line)"
}

function cacheKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function readCache(name: string): BfoFighterData | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeCache(name: string, data: BfoFighterData) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(name)}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

function buildSearchUrl(name: string): string {
  // BFO fighter pages use slug format: First-Last-ID
  const slug = name.replace(/\s+/g, "-");
  return `${BASE}/fighters/${slug}`;
}

export async function getBfoData(fighterName: string): Promise<BfoFighterData | null> {
  const cached = readCache(fighterName);
  if (cached) return cached;

  try {
    const url = buildSearchUrl(fighterName);
    const html = await axios.get<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      timeout: 10000,
      responseType: "text",
    }).then(r => r.data);

    const $ = cheerio.load(html);

    // Check if we landed on a valid fighter page
    const title = $("title").text();
    if (!title || title.includes("Search") || title.includes("404")) {
      return null;
    }

    const fights: BfoFightOdds[] = [];
    let atsWin = 0, atsLoss = 0;

    $("table.table tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 4) return;
      const opponent = $(tds[0]).text().trim();
      const result = $(tds[1]).text().trim().toUpperCase();
      const open = $(tds[2]).text().trim();
      const close = $(tds[3]).text().trim();
      const date = $(tds[4])?.text().trim() ?? "";
      if (!opponent || !open) return;

      // ATS: if fighter was favored (negative) and won, or underdog and won
      const closeParsed = parseInt(close.replace("+", ""), 10);
      const isFavorite = close.startsWith("-");
      const won = result === "W";
      if (!isNaN(closeParsed)) {
        if ((won && isFavorite) || (won && !isFavorite)) atsWin++;
        else atsLoss++;
      }

      fights.push({ opponent, result, openLine: open, closeLine: close, date });
    });

    const totalFights = atsWin + atsLoss;
    const atsRecord = totalFights > 0
      ? `${Math.round((atsWin / totalFights) * 100)}% cover rate (${atsWin}-${atsLoss} ATS)`
      : null;

    const data: BfoFighterData = { name: fighterName, fights: fights.slice(0, 8), atsRecord };
    writeCache(fighterName, data);
    logger.info({ fighterName, fightCount: fights.length }, "BestFightOdds data fetched");
    return data;
  } catch (err) {
    logger.debug({ err, fighterName }, "BestFightOdds fetch failed");
    return null;
  }
}

export function formatBfoContext(data: BfoFighterData): string | null {
  if (!data.fights.length) return null;
  const lines: string[] = [];
  if (data.atsRecord) lines.push(`Market performance: ${data.atsRecord}`);
  lines.push("Historical odds (open → close):");
  data.fights.slice(0, 5).forEach(f => {
    lines.push(`  [${f.result}] vs ${f.opponent}: ${f.openLine} → ${f.closeLine}${f.date ? ` (${f.date})` : ""}`);
  });
  return lines.join("\n");
}
