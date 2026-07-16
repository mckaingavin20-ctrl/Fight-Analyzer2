/**
 * Sherdog fighter data scraper.
 * Fetches real fight records from sherdog.com and caches them on disk.
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = "/tmp/ufc-sherdog-cache";
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

/** Search Sherdog for a fighter, return their profile URL slug (e.g. /fighter/Dricus-Du-Plessis-146193) */
async function searchFighter(name: string): Promise<string | null> {
  const query = encodeURIComponent(name);
  const html = await get(`${SHERDOG_BASE}/stats/fightfinder?SearchTxt=${query}`);
  const $ = cheerio.load(html);

  // Table rows in .fightfinder_result — grab the first result
  const firstRow = $("table.fightfinder_result tr:not(.table_head)").first();
  if (!firstRow.length) return null;

  // The onclick or the anchor href
  const anchor = firstRow.find("td a").first();
  const href = anchor.attr("href");
  if (!href) return null;

  return href.startsWith("/") ? href : `/${href}`;
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

/** Format Sherdog data into a compact text block for the AI prompt */
export function formatSherdogContext(data: SherdogFighterData): string {
  const record = `${data.wins}-${data.losses}${data.draws > 0 ? `-${data.draws}` : ""}${data.noContests > 0 ? ` (${data.noContests} NC)` : ""}`;
  const lines: string[] = [
    `Fighter: ${data.name}`,
    `Record: ${record} | Camp: ${data.association} | From: ${data.nationality}`,
    `Recent fights (most recent first):`,
  ];

  for (const f of data.recentFights) {
    const r = f.result.toUpperCase().padEnd(4);
    const rd = f.round ? `R${f.round} ${f.time}` : "";
    lines.push(`  [${r}] vs ${f.opponent} — ${f.method}${rd ? ` ${rd}` : ""} (${f.date})`);
  }

  return lines.join("\n");
}
