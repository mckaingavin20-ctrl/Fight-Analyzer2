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

// ── Name-similarity helpers ────────────────────────────────────────────────

/** Normalise a name to lowercase alpha-only tokens */
function normTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\bjr\.?\b|\bsr\.?\b/gi, "")
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score how well `candidate` (a name found on Sherdog) matches `query` (what we searched for).
 * Returns 0–1; higher is better.
 *
 * Strategy:
 *  - Last names must share significant overlap (hard requirement)
 *  - Token overlap across the full name boosts the score
 *  - Penalise when the candidate has many extra tokens not in the query
 */
function nameMatchScore(query: string, candidate: string): number {
  const qToks = normTokens(query);
  const cToks = normTokens(candidate);
  if (!qToks.length || !cToks.length) return 0;

  const qLast = qToks[qToks.length - 1];
  const cLast = cToks[cToks.length - 1];

  // Last names must share a stem (handles "Rodrigues" vs "Rodrigues Jr", "Song" vs "Song")
  const lastOk =
    qLast === cLast ||
    qLast.startsWith(cLast) ||
    cLast.startsWith(qLast);
  if (!lastOk) return 0;

  // Token overlap
  const qSet = new Set(qToks);
  const cSet = new Set(cToks);
  const shared = [...qSet].filter((t) => cSet.has(t)).length;
  const union  = new Set([...qToks, ...cToks]).size;
  const jaccard = shared / union;

  // Extra penalty: candidate has tokens that aren't in query at all
  const extraC = [...cSet].filter((t) => !qSet.has(t)).length;
  const penalty = extraC * 0.08;

  return Math.max(0, jaccard - penalty);
}

interface SearchCandidate { slug: string; name: string }

/** Search Sherdog, return ALL result rows as { slug, name } candidates */
async function searchFighterOnce(query: string): Promise<SearchCandidate[]> {
  const html = await get(
    `${SHERDOG_BASE}/stats/fightfinder?SearchTxt=${encodeURIComponent(query)}`
  );
  const $ = cheerio.load(html);
  const candidates: SearchCandidate[] = [];

  $("table.fightfinder_result tr:not(.table_head)").each((_, row) => {
    const anchor = $(row).find("td a").first();
    const href   = anchor.attr("href");
    const name   = anchor.text().trim();
    if (!href || !name) return;
    const slug = href.startsWith("/") ? href : `/${href}`;
    candidates.push({ slug, name });
  });

  return candidates;
}

/**
 * Search Sherdog for a fighter by trying multiple name variations.
 * For each variation, we fetch ALL result rows, score each candidate against
 * the *original* query name, and return the best-matching slug.
 *
 * Rejects a candidate if:
 *   - Name match score < 0.25 (clearly different person)
 *   - Last fight was before 2016 AND query fighter is expected to be active
 *     (we detect "stale" by fetching a lightweight profile check)
 */
async function searchFighter(name: string): Promise<string | null> {
  const variations = generateNameVariations(name);
  let bestSlug: string | null = null;
  let bestScore = 0;

  for (const v of variations) {
    let candidates: SearchCandidate[] = [];
    try {
      candidates = await searchFighterOnce(v);
    } catch {
      continue;
    }
    if (!candidates.length) continue;

    for (const c of candidates) {
      const score = nameMatchScore(name, c.name);
      if (score > bestScore) {
        bestScore = score;
        bestSlug = c.slug;
        if (v !== name) {
          logger.info({ original: name, usedVariation: v, matched: c.name, score }, "Sherdog: candidate via variation");
        }
      }
    }

    // If we already have a strong match (≥0.6), stop trying further variations
    if (bestScore >= 0.6) break;
  }

  if (!bestSlug || bestScore < 0.20) {
    logger.warn({ name, bestScore }, "Sherdog: no confident name match found");
    return null;
  }

  logger.info({ name, bestSlug, bestScore: bestScore.toFixed(2) }, "Sherdog: best slug selected");
  return bestSlug;
}

/** Quick sanity check: is the fetched profile plausibly for an active MMA fighter?
 *  Returns false if the most recent fight is before 2016 — likely a wrong/retired person. */
function profileLooksActive(data: SherdogFighterData): boolean {
  const latest = data.recentFights[0];
  if (!latest) return true; // no fights parsed — give benefit of the doubt
  // Parse "Jul / 18 / 2026" or "Jul. 18, 2026" or "2026-07-18"
  const yearMatch = latest.date.match(/\b(20\d\d|19\d\d)\b/);
  if (!yearMatch) return true;
  const year = parseInt(yearMatch[1], 10);
  return year >= 2016;
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
  // Validate cache: evict entries that look like a wrong person was fetched
  const cached = readCache(fighterName);
  if (cached) {
    const nameScore = nameMatchScore(fighterName, cached.name);
    const active    = profileLooksActive(cached);
    if (nameScore < 0.20 || !active) {
      logger.warn(
        { fighterName, cachedName: cached.name, nameScore: nameScore.toFixed(2), active },
        "Sherdog cache evicted — wrong person or stale profile; re-fetching"
      );
      // Remove bad cache entry
      try {
        const p = path.join(CACHE_DIR, `${cacheKey(fighterName)}.json`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch { /* ignore */ }
    } else {
      logger.debug({ fighterName, nameScore: nameScore.toFixed(2) }, "Returning cached Sherdog data");
      return cached;
    }
  }

  try {
    logger.info({ fighterName }, "Fetching Sherdog profile");

    const profileSlug = await searchFighter(fighterName);
    if (!profileSlug) {
      logger.warn({ fighterName }, "Sherdog search: no confident match found");
      return null;
    }

    const profileHtml = await get(`${SHERDOG_BASE}${profileSlug}`);
    const data = parseProfile(profileHtml, profileSlug);
    data.name = data.name || fighterName;

    // Final guard: if the parsed profile doesn't look like the right person, abort
    const nameScore = nameMatchScore(fighterName, data.name);
    if (nameScore < 0.20) {
      logger.warn(
        { fighterName, fetchedName: data.name, nameScore: nameScore.toFixed(2), url: data.sherdogUrl },
        "Sherdog: fetched profile name doesn't match query — discarding"
      );
      return null;
    }
    if (!profileLooksActive(data)) {
      logger.warn(
        { fighterName, fetchedName: data.name, lastFight: data.recentFights[0]?.date },
        "Sherdog: fetched profile last fight is before 2016 — likely wrong/retired fighter, discarding"
      );
      return null;
    }

    writeCache(fighterName, data);
    logger.info(
      { fighterName, fetchedName: data.name, nameScore: nameScore.toFixed(2), record: `${data.wins}-${data.losses}` },
      "Sherdog data fetched and validated"
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
