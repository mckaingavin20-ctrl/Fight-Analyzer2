/**
 * MMADecisions.com — judge scoring patterns for decision-heavy fighters.
 *
 * This source tells us:
 * - How a fighter does when fights go to the judges
 * - Whether they tend to win close decisions or lose them
 * - Judge scoring breakdown (e.g., 29-28, 30-27 patterns)
 *
 * Most valuable for fighters with a high % of decision finishes.
 * Caches to disk for 48 hours.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BASE = "http://www.mmadecisions.com";

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/mmadecisions"
);
const CACHE_TTL = 48 * 60 * 60 * 1000;

export interface MmaDecisionsData {
  name: string;
  totalDecisions: number;
  won: number;
  lost: number;
  // Scores like "30-27 dominant" vs "29-28 split"
  decisionQuality: string | null;
  recentDecisions: Array<{
    result: string;
    opponent: string;
    scores: string;
    event: string;
    date: string;
  }>;
}

function cacheKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function readCache(name: string): MmaDecisionsData | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeCache(name: string, data: MmaDecisionsData) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(name)}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

async function searchFighter(name: string): Promise<string | null> {
  // MMADecisions uses URL format /fighter/<id>/<slug>
  // Search via their search page
  const q = encodeURIComponent(name);
  const html = await axios.get<string>(`${BASE}/fighter-search.php?q=${q}`, {
    headers: { "User-Agent": UA },
    timeout: 10000,
    responseType: "text",
  }).then(r => r.data).catch(() => "");

  const $ = cheerio.load(html);
  const link = $('a[href*="/fighter/"]').first().attr("href");
  return link ?? null;
}

export async function getMmaDecisionsData(fighterName: string): Promise<MmaDecisionsData | null> {
  const cached = readCache(fighterName);
  if (cached) return cached;

  try {
    const profileUrl = await searchFighter(fighterName);
    if (!profileUrl) {
      logger.debug({ fighterName }, "MMADecisions: fighter not found");
      return null;
    }

    const url = profileUrl.startsWith("http") ? profileUrl : `${BASE}${profileUrl}`;
    const html = await axios.get<string>(url, {
      headers: { "User-Agent": UA },
      timeout: 10000,
      responseType: "text",
    }).then(r => r.data);

    const $ = cheerio.load(html);
    const recentDecisions: MmaDecisionsData["recentDecisions"] = [];
    let won = 0, lost = 0;

    // Parse decision fight rows
    $("table.decision-list tr, tr.decision-row").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;
      const resultText = $(tds[0]).text().trim().toUpperCase();
      if (!["WIN", "LOSS", "W", "L"].includes(resultText)) return;
      const result = resultText.startsWith("W") ? "W" : "L";
      if (result === "W") won++; else lost++;
      recentDecisions.push({
        result,
        opponent: $(tds[1]).text().trim(),
        event: $(tds[2]).text().trim(),
        scores: $(tds[3])?.text().trim() ?? "",
        date: $(tds[4])?.text().trim() ?? "",
      });
    });

    const total = won + lost;
    let quality: string | null = null;
    if (total > 0) {
      const winPct = Math.round((won / total) * 100);
      quality = `${winPct}% decision win rate (${won}W-${lost}L in ${total} decisions)`;
    }

    const data: MmaDecisionsData = {
      name: fighterName,
      totalDecisions: total,
      won, lost,
      decisionQuality: quality,
      recentDecisions: recentDecisions.slice(0, 6),
    };

    writeCache(fighterName, data);
    logger.info({ fighterName, won, lost }, "MMADecisions data fetched");
    return data;
  } catch (err) {
    logger.debug({ err, fighterName }, "MMADecisions fetch failed");
    return null;
  }
}

export function formatMmaDecisionsContext(data: MmaDecisionsData): string | null {
  if (data.totalDecisions === 0) return null;
  const lines = [`Decision record: ${data.decisionQuality}`];
  if (data.recentDecisions.length > 0) {
    lines.push("Decision history:");
    data.recentDecisions.slice(0, 4).forEach(d => {
      lines.push(`  [${d.result}] vs ${d.opponent}${d.scores ? ` — ${d.scores}` : ""}${d.date ? ` (${d.date})` : ""}`);
    });
  }
  return lines.join("\n");
}
