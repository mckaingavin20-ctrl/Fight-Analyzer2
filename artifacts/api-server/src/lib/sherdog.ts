/**
 * Sherdog fighter data scraper.
 * Fetches real fight records from sherdog.com and caches them on disk.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

// Stored inside the project directory so it survives server restarts.
const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/sherdog"    // dist/../.cache → artifacts/api-server/.cache/sherdog
);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SHERDOG_BASE = "https://www.sherdog.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface SherdogFight {
  result: "win" | "loss" | "draw" | "nc";
  opponent: string;
  event: string;
  date: string;
  method: string;
  round: number | null;
  time: string;
}

export interface SherdogFighterData {
  name: string;
  sherdogUrl: string;
  association: string;
  nationality: string;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  recentFights: SherdogFight[]; // up to 10, most recent first
  fetchedAt: number;
}

function cacheKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readCache(name: string): SherdogFighterData | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    const age = Date.now() - fs.statSync(p).mtimeMs;
    if (age > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as SherdogFighterData;
  } catch {
    return null;
  }
}

function writeCache(name: string, data: SherdogFighterData): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(CACHE_DIR, `${cacheKey(name)}.json`),
      JSON.stringify(data),
      "utf8"
    );
  } catch (err) {
    logger.warn({ err }, "Failed to write Sherdog cache");
  }
}

/** Fetch a URL with exponential-backoff retry (item 7: rate limit / transient error resilience) */
async function get(url: string, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeout: 12000,
        responseType: "text",
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Generate name search variations to handle international fighter names:
 * - Accents removed (José → Jose, Renato Moicano → Renato Moicano)
 * - Last name only (great for Russian/Kazakh fighters: Ankalaev)
 * - First + last only (skip middle names)
 * - Reversed order (some databases store Last, First)
 * - Hyphenated name flattened
 */
function generateNameVariations(name: string): string[] {
  const variations: string[] = [name];

  // Remove diacritics/accents
  const noAccents = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (noAccents !== name) variations.push(noAccents);

  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    // Last name only — works well for Russian/Kazakh names
    variations.push(parts[parts.length - 1]);
    // Last name without accents
    const lastName = parts[parts.length - 1].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lastName !== parts[parts.length - 1]) variations.push(lastName);
    // First + Last only (drop middle names/particles)
    if (parts.length > 2) variations.push(`${parts[0]} ${parts[parts.length - 1]}`);
    // Drop short particles like "de", "do", "da", "dos", "du", "van", "von"
    const filtered = parts.filter(p => p.length > 2 || /^[A-Z]/.test(p));
    if (filtered.length !== parts.length && filtered.length >= 2) {
      variations.push(filtered.join(" "));
    }
    // Reversed (Last First)
    if (parts.length === 2) variations.push(`${parts[1]} ${parts[0]}`);
  }

  // Deduplicate, keep original first
  return [...new Set(variations)];
}

/** Search Sherdog for a fighter with a single query, return profile URL slug */
async function searchFighterOnce(query: string): Promise<string | null> {
  const html = await get(`${SHERDOG_BASE}/stats/fightfinder?SearchTxt=${encodeURIComponent(query)}`);
  const $ = cheerio.load(html);

  const firstRow = $("table.fightfinder_result tr:not(.table_head)").first();
  if (!firstRow.length) return null;
  const anchor = firstRow.find("td a").first();
  const href = anchor.attr("href");
  if (!href) return null;
  return href.startsWith("/") ? href : `/${href}`;
}

/** Search Sherdog for a fighter, trying multiple name variations */
async function searchFighter(name: string): Promise<string | null> {
  const variations = generateNameVariations(name);
  for (const v of variations) {
    try {
      const result = await searchFighterOnce(v);
      if (result) {
        if (v !== name) logger.info({ original: name, usedVariation: v }, "Sherdog: found via name variation");
        return result;
      }
    } catch {
      // continue to next variation
    }
  }
  return null;
}

/** Parse a Sherdog fighter profile page */
function parseProfile(html: string, profileUrl: string): SherdogFighterData {
  const $ = cheerio.load(html);

  // Name from h1 itemprop="name"
  const name =
    $('[itemprop="name"] span[class="fn"]').text().trim() ||
    $('h1[itemprop="name"]').text().trim() ||
    $("h1").first().text().replace(/"/g, "").trim();

  // Association / gym
  const association = $("a.association").first().text().trim() || "Unknown";

  // Nationality
  const nationality =
    $('[itemprop="nationality"]').first().text().trim() || "Unknown";

  // Fight history table
  const fights: SherdogFight[] = [];

  $("table.new_table.fighter tr:not(.table_head)").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length < 5) return;

    const resultSpan = $(tds[0]).find("span.final_result");
    const resultText = resultSpan.text().trim().toLowerCase();
    let result: SherdogFight["result"] = "nc";
    if (resultText === "win") result = "win";
    else if (resultText === "loss") result = "loss";
    else if (resultText === "draw") result = "draw";

    const opponent = $(tds[1]).find("a").first().text().trim();
    const eventLink = $(tds[2]).find("a").first().text().trim();
    const dateLine = $(tds[2]).find("span.sub_line").first().text().trim();

    const methodCell = $(tds[3]);
    const method = methodCell.find("b").first().text().trim();

    const roundText = $(tds[4]).text().trim();
    const round = parseInt(roundText, 10) || null;
    const time = $(tds[5]).text().trim();

    if (!opponent) return; // skip header/empty rows

    fights.push({
      result,
      opponent,
      event: eventLink,
      date: dateLine,
      method,
      round,
      time,
    });
  });

  // Tally record from parsed fights (Sherdog sometimes puts NC fights in too)
  const wins = fights.filter((f) => f.result === "win").length;
  const losses = fights.filter((f) => f.result === "loss").length;
  const draws = fights.filter((f) => f.result === "draw").length;
  const noContests = fights.filter((f) => f.result === "nc").length;

  return {
    name,
    sherdogUrl: `${SHERDOG_BASE}${profileUrl}`,
    association,
    nationality,
    wins,
    losses,
    draws,
    noContests,
    recentFights: fights.slice(0, 10),
    fetchedAt: Date.now(),
  };
}

/** Main export: fetch Sherdog data for a fighter, with cache */
export async function getFighterData(
  fighterName: string
): Promise<SherdogFighterData | null> {
  const cached = readCache(fighterName);
  if (cached) {
    logger.debug({ fighterName }, "Returning cached Sherdog data");
    return cached;
  }

  try {
    logger.info({ fighterName }, "Fetching Sherdog profile");

    const profileSlug = await searchFighter(fighterName);
    if (!profileSlug) {
      logger.warn({ fighterName }, "Sherdog search returned no results");
      return null;
    }

    const profileHtml = await get(`${SHERDOG_BASE}${profileSlug}`);
    const data = parseProfile(profileHtml, profileSlug);
    data.name = data.name || fighterName; // fallback if parse missed name

    writeCache(fighterName, data);
    logger.info(
      { fighterName, record: `${data.wins}-${data.losses}`, fights: data.recentFights.length },
      "Sherdog data fetched"
    );
    return data;
  } catch (err) {
    logger.warn({ err, fighterName }, "Sherdog fetch failed");
    return null;
  }
}

/** Parse Sherdog date strings like "Jul. 18, 2026" → Date */
function parseSherdogDate(dateStr: string): Date | null {
  try {
    const d = new Date(dateStr.replace(/\./g, ""));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Categorise a method string into a finish type */
function finishType(method: string): "KO/TKO" | "Sub" | "Dec" | "Other" {
  const m = method.toLowerCase();
  if (m.includes("ko") || m.includes("tko") || m.includes("knockout")) return "KO/TKO";
  if (m.includes("sub") || m.includes("choke") || m.includes("lock") || m.includes("bar")) return "Sub";
  if (m.includes("dec") || m.includes("decision") || m.includes("pts")) return "Dec";
  return "Other";
}

/** Format Sherdog data into a compact text block for the AI prompt */
export function formatSherdogContext(data: SherdogFighterData): string {
  const record = `${data.wins}-${data.losses}${data.draws > 0 ? `-${data.draws}` : ""}${data.noContests > 0 ? ` (${data.noContests} NC)` : ""}`;

  // --- Computed finish breakdowns ---
  const wins   = data.recentFights.filter(f => f.result === "win");
  const losses = data.recentFights.filter(f => f.result === "loss");

  const countBy = (arr: typeof wins) => {
    let ko = 0, sub = 0, dec = 0, other = 0;
    for (const f of arr) {
      const t = finishType(f.method);
      if (t === "KO/TKO") ko++;
      else if (t === "Sub") sub++;
      else if (t === "Dec") dec++;
      else other++;
    }
    return { ko, sub, dec, other };
  };

  const wc = countBy(wins);
  const lc = countBy(losses);

  const winBreakdown = wins.length > 0
    ? `KO/TKO: ${wc.ko} | Sub: ${wc.sub} | Dec: ${wc.dec}${wc.other ? ` | Other: ${wc.other}` : ""}`
    : "No recorded wins";
  const lossBreakdown = losses.length > 0
    ? `KO/TKO: ${lc.ko} | Sub: ${lc.sub} | Dec: ${lc.dec}${lc.other ? ` | Other: ${lc.other}` : ""}`
    : "No recorded losses";

  const finishPct = wins.length > 0
    ? Math.round(((wc.ko + wc.sub) / wins.length) * 100)
    : 0;

  // --- Layoff ---
  const lastFightDate = data.recentFights[0]
    ? parseSherdogDate(data.recentFights[0].date) : null;
  const daysSinceLast = lastFightDate
    ? Math.floor((Date.now() - lastFightDate.getTime()) / 86_400_000) : null;
  const layoffStr = daysSinceLast !== null
    ? daysSinceLast <= 90  ? `${daysSinceLast}d ago (fresh)`
    : daysSinceLast <= 180 ? `${daysSinceLast}d ago (normal)`
    : daysSinceLast <= 365 ? `${daysSinceLast}d ago (moderate layoff)`
    : `${daysSinceLast}d ago ⚠ LONG LAYOFF — ring rust risk`
    : "Unknown";

  const lines: string[] = [
    `Fighter: ${data.name}`,
    `Record: ${record} | Camp: ${data.association} | From: ${data.nationality}`,
    `Win method breakdown (recent ${wins.length}): ${winBreakdown}`,
    `Finish rate: ${finishPct}% of wins by finish`,
    `Loss method breakdown (recent ${losses.length}): ${lossBreakdown}`,
    `Last fight: ${layoffStr}`,
    `Recent fights (most recent first):`,
  ];

  for (const f of data.recentFights) {
    const r = f.result.toUpperCase().padEnd(4);
    const rd = f.round ? `R${f.round} ${f.time}` : "";
    lines.push(`  [${r}] vs ${f.opponent} — ${f.method}${rd ? ` ${rd}` : ""} (${f.date})`);
  }

  return lines.join("\n");
}
