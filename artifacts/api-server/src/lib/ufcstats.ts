/**
 * UFCStats.com scraper — official UFC stats backend.
 *
 * UFCStats uses a SHA-256 proof-of-work browser challenge. We solve it
 * server-side (Node crypto), POST the solution to /__c, and cache the
 * resulting session cookie in memory so we only re-solve when it expires.
 *
 * Data available:
 *   • Fighter physical attributes (height, weight, reach, stance, DOB/age)
 *   • Career stats: SLpM, Str.Acc, SApM, Str.Def, TD Avg, TD Acc, TD Def, Sub Avg
 *   • Upcoming event list with bout lineups
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";

const BASE = "http://ufcstats.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── PoW session management ─────────────────────────────────────────────
interface Session {
  cookie: string;
  at: number;
}
let _session: Session | null = null;
const SESSION_TTL = 50 * 60 * 1000; // 50 min (re-solve before cookie expiry)

function sha256hex(msg: string): string {
  return createHash("sha256").update(msg, "utf8").digest("hex");
}

function solvePoW(nonce: string, targetLen: number): number {
  const target = "0".repeat(targetLen);
  let n = 0;
  while (!sha256hex(`${nonce}:${n}`).startsWith(target)) n++;
  return n;
}

async function getValidSession(): Promise<string> {
  if (_session && Date.now() - _session.at < SESSION_TTL) return _session.cookie;

  logger.info("UFCStats: solving PoW for fresh session");
  const r1 = await axios.get<string>(`${BASE}/statistics/events/upcoming`, {
    headers: { "User-Agent": UA },
    timeout: 15000,
    responseType: "text",
  });

  const html = r1.data;
  const nonceM = html.match(/nonce="([^"]+)"/);
  const initCookies = (r1.headers["set-cookie"] ?? [])
    .map((c: string) => c.split(";")[0])
    .join("; ");

  if (!nonceM) {
    // No challenge — page already served (shouldn't happen but handle it)
    _session = { cookie: initCookies, at: Date.now() };
    return _session.cookie;
  }

  const nonce = nonceM[1];
  const targetLen = parseInt((html.match(/new Array\((\d+)\+1\)/) ?? [])[1] ?? "2", 10);
  const n = solvePoW(nonce, targetLen);

  const r2 = await axios.post<string>(
    `${BASE}/__c`,
    `nonce=${encodeURIComponent(nonce)}&n=${n}`,
    {
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: initCookies,
        Referer: `${BASE}/statistics/events/upcoming`,
      },
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: () => true,
    }
  );

  const sessionCookie = (r2.headers["set-cookie"] ?? [])
    .map((c: string) => c.split(";")[0])
    .join("; ");
  const cookie = [initCookies, sessionCookie].filter(Boolean).join("; ");

  _session = { cookie, at: Date.now() };
  logger.info("UFCStats: fresh session obtained");
  return cookie;
}

/** Fetch a URL with a valid session, auto-solving PoW if challenged. */
async function get(url: string, retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const cookie = await getValidSession();
    const res = await axios.get<string>(url, {
      headers: { "User-Agent": UA, Cookie: cookie },
      timeout: 15000,
      responseType: "text",
    });
    const html = res.data;
    if (!html.includes("Checking your browser")) return html;
    // Got challenged again — bust session and retry
    _session = null;
    if (attempt === retries) throw new Error(`UFCStats PoW retry exhausted for ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Unreachable");
}

// ── Disk cache ─────────────────────────────────────────────────────────
const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/ufcstats"
);
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function cacheKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readFighterCache(name: string): UfcStatsFighterStats | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(name)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as UfcStatsFighterStats;
  } catch {
    return null;
  }
}

function writeFighterCache(name: string, data: UfcStatsFighterStats): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(name)}.json`), JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, "UFCStats: failed to write fighter cache");
  }
}

// ── Fighter search ─────────────────────────────────────────────────────
function nameSim(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const na = n(a), nb = n(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Candidate letters to try for a fighter name, in order:
 * last-name first letter, second-to-last word, first-name first letter.
 * Handles compound last names (Du Plessis → d or p), Brazilian names, etc.
 */
function candidateLetters(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = new Set<string>();
  if (parts.length >= 1) letters.add(parts[parts.length - 1][0].toLowerCase()); // last word
  if (parts.length >= 2) letters.add(parts[parts.length - 2][0].toLowerCase()); // second-to-last
  if (parts.length >= 1) letters.add(parts[0][0].toLowerCase());                // first name
  return Array.from(letters).filter((l) => /[a-z]/.test(l));
}

async function searchFighterByLetter(
  name: string,
  letter: string
): Promise<string | null> {
  const html = await get(`${BASE}/statistics/fighters?char=${letter}&page=all`);
  const $ = cheerio.load(html);

  let detailUrl: string | null = null;
  $("tr").each((_, row) => {
    if (detailUrl) return;
    const firstA = $(row).find("a").first();
    const secondA = $(row).find("a").eq(1);
    const firstName = firstA.text().trim();
    const lastName = secondA.text().trim();
    const fullRowName = `${firstName} ${lastName}`.trim();
    if (!fullRowName) return;
    if (nameSim(fullRowName, name)) {
      detailUrl = firstA.attr("href") ?? null;
    }
  });

  return detailUrl;
}

async function searchFighter(name: string): Promise<string | null> {
  const letters = candidateLetters(name);
  for (const letter of letters) {
    try {
      const url = await searchFighterByLetter(name, letter);
      if (url) return url;
    } catch (err) {
      logger.debug({ err, name, letter }, "UFCStats: letter page fetch failed");
    }
  }
  return null;
}

// ── Fighter detail parser ──────────────────────────────────────────────
export interface UfcStatsFighterStats {
  name: string;
  url: string;
  // Physical
  height: string | null;
  weight: string | null;
  reach: string | null;
  stance: string | null;
  dob: string | null;
  age: number | null;
  // Striking (career averages)
  slpm: number | null;      // Strikes landed per minute
  strAcc: number | null;    // Strike accuracy %
  sapm: number | null;      // Strikes absorbed per minute
  strDef: number | null;    // Strike defense %
  // Grappling (career averages)
  tdAvg: number | null;     // Takedown avg per 15 min
  tdAcc: number | null;     // Takedown accuracy %
  tdDef: number | null;     // Takedown defense %
  subAvg: number | null;    // Submission attempts per 15 min
  fetchedAt: number;
}

function parsePct(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseAge(dob: string | null): number | null {
  if (!dob) return null;
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    return Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  } catch {
    return null;
  }
}

function parseFighterDetail(html: string, url: string): UfcStatsFighterStats {
  const $ = cheerio.load(html);
  const name = $("span.b-content__title-highlight").text().trim();

  // Build a label→value map from all list items (format: "Label: Value")
  const li: Record<string, string> = {};
  $("li.b-list__box-list-item").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const idx = text.indexOf(":");
    if (idx === -1) return;
    const key = text.slice(0, idx).trim().toLowerCase();
    const val = text.slice(idx + 1).trim();
    if (key && val && val !== "--") li[key] = val;
  });

  const dob = li["dob"] ?? null;
  return {
    name,
    url,
    height: li["height"] ?? null,
    weight: li["weight"] ?? null,
    reach: li["reach"] ?? null,
    stance: li["stance"] ?? null,
    dob,
    age: parseAge(dob),
    slpm: parseNum(li["slpm"]),
    strAcc: parsePct(li["str. acc."]),
    sapm: parseNum(li["sapm"]),
    strDef: parsePct(li["str. def"]),
    tdAvg: parseNum(li["td avg."]),
    tdAcc: parsePct(li["td acc."]),
    tdDef: parsePct(li["td def."]),
    subAvg: parseNum(li["sub. avg."]),
    fetchedAt: Date.now(),
  };
}

// ── Public fighter API ─────────────────────────────────────────────────
export async function getFighterStats(
  name: string
): Promise<UfcStatsFighterStats | null> {
  const cached = readFighterCache(name);
  if (cached) {
    logger.debug({ name }, "UFCStats: returning cached fighter stats");
    return cached;
  }

  try {
    logger.info({ name }, "UFCStats: searching for fighter");
    const detailUrl = await searchFighter(name);
    if (!detailUrl) {
      logger.warn({ name }, "UFCStats: fighter not found in index");
      return null;
    }

    const html = await get(detailUrl);
    const data = parseFighterDetail(html, detailUrl);
    data.name = data.name || name;

    writeFighterCache(name, data);
    logger.info(
      { name, slpm: data.slpm, tdDef: data.tdDef, strDef: data.strDef },
      "UFCStats: fighter stats fetched"
    );
    return data;
  } catch (err) {
    logger.warn({ err, name }, "UFCStats: fighter fetch failed");
    return null;
  }
}

/** Format UFCStats data into a compact block for the AI prompt. */
export function formatUfcStatsContext(data: UfcStatsFighterStats): string {
  const lines: string[] = [];

  const phys: string[] = [];
  if (data.height) phys.push(data.height);
  if (data.weight) phys.push(data.weight);
  if (data.reach) phys.push(`${data.reach} reach`);
  if (data.stance) phys.push(data.stance);
  if (data.age !== null) phys.push(`Age ${data.age}`);
  if (phys.length) lines.push(`Physical: ${phys.join(" | ")}`);

  // Strike output (offensive)
  const strOut: string[] = [];
  if (data.slpm !== null) strOut.push(`${data.slpm}/min landed`);
  if (data.strAcc !== null) strOut.push(`${data.strAcc}% acc`);
  if (data.sapm !== null) strOut.push(`${data.sapm}/min absorbed`);
  if (data.strDef !== null) strOut.push(`${data.strDef}% def`);
  if (strOut.length) lines.push(`Striking: ${strOut.join(" | ")}`);

  // Grappling
  const grap: string[] = [];
  if (data.tdAvg !== null) grap.push(`${data.tdAvg} TDs/15min`);
  if (data.tdAcc !== null) grap.push(`${data.tdAcc}% TD acc`);
  if (data.tdDef !== null) grap.push(`${data.tdDef}% TD def`);
  if (data.subAvg !== null) grap.push(`${data.subAvg} subs/15min`);
  if (grap.length) lines.push(`Grappling: ${grap.join(" | ")}`);

  return lines.join("\n");
}

// ── Upcoming events ────────────────────────────────────────────────────
export interface UfcStatsEvent {
  id: string;
  name: string;
  date: string;   // ISO string
  location: string;
  url: string;
}

let _eventsCache: { data: UfcStatsEvent[]; at: number } | null = null;
const EVENTS_TTL = 30 * 60 * 1000;

export function clearUfcStatsCache(): void {
  _eventsCache = null;
  _session = null;
}

export async function getUpcomingUfcStatsEvents(): Promise<UfcStatsEvent[]> {
  if (_eventsCache && Date.now() - _eventsCache.at < EVENTS_TTL) return _eventsCache.data;

  const html = await get(`${BASE}/statistics/events/upcoming`);
  const $ = cheerio.load(html);

  const events: UfcStatsEvent[] = [];
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  $("tr").each((_, row) => {
    const a = $(row).find(`a[href*="event-details"]`).first();
    if (!a.length) return;

    const url = a.attr("href") ?? "";
    const idM = url.match(/event-details\/([a-f0-9]+)/);
    if (!idM) return;

    const name = a.text().replace(/\s+/g, " ").trim();
    const rowText = $(row).text().replace(/\s+/g, " ").trim();

    // Date is in format "Month DD, YYYY" somewhere in the row text
    const dateM = rowText.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
    const dateStr = dateM ? new Date(dateM[1]).toISOString() : "";

    if (dateStr && new Date(dateStr) < cutoff) return;

    // Location: whatever remains after removing name and date
    const remainder = rowText
      .replace(name, "")
      .replace(dateM?.[0] ?? "", "")
      .replace(/\s+/g, " ")
      .trim();

    events.push({ id: idM[1], name, date: dateStr, location: remainder, url });
  });

  _eventsCache = { data: events, at: Date.now() };
  logger.info({ count: events.length }, "UFCStats: upcoming events fetched");
  return events;
}

// ── Event bout lineup ──────────────────────────────────────────────────
export interface UfcStatsBout {
  fighterA: string;
  fighterB: string;
  weightClass: string;
  boutUrl: string | null;
}

const _boutCache = new Map<string, { data: UfcStatsBout[]; at: number }>();
const BOUT_TTL = 15 * 60 * 1000;

export async function getEventBouts(
  eventId: string,
  eventUrl: string
): Promise<UfcStatsBout[]> {
  const cached = _boutCache.get(eventId);
  if (cached && Date.now() - cached.at < BOUT_TTL) return cached.data;

  const html = await get(eventUrl);
  const $ = cheerio.load(html);

  const bouts: UfcStatsBout[] = [];

  $("tr").each((_, row) => {
    const rowText = $(row).text().replace(/\s+/g, " ").trim();
    if (!rowText.toLowerCase().includes("view matchup")) return;

    // Fighter links are the first two anchors before "View Matchup"
    const links = $(row).find("a");
    const boutLink = $(row).find(`a[href*="fight-details"]`).first();

    // Find names: first two fighter-name links (not "View Matchup")
    const fighterLinks = links.filter((_, a) => {
      const href = $(a).attr("href") ?? "";
      return href.includes("fighter-details");
    });

    const fighterA = $(fighterLinks[0]).text().trim();
    const fighterB = $(fighterLinks[1]).text().trim();
    if (!fighterA || !fighterB) return;

    // Weight class: text after "View Matchup"
    const afterMatchup = rowText.split(/view matchup/i)[1]?.trim() ?? "";
    const weightClass = afterMatchup.split(/\s{2,}/)[0].trim();

    bouts.push({
      fighterA,
      fighterB,
      weightClass,
      boutUrl: boutLink.attr("href") ?? null,
    });
  });

  _boutCache.set(eventId, { data: bouts, at: Date.now() });
  logger.info({ eventId, count: bouts.length }, "UFCStats: event bouts fetched");
  return bouts;
}
