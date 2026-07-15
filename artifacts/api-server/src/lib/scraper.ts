import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger.js";

const BASE = "http://www.ufcstats.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

async function get(url: string) {
  const res = await axios.get(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    timeout: 20000,
  });
  return cheerio.load(res.data as string);
}

export interface EventSummary {
  id: string;
  name: string;
  date: string;
  venue: string | null;
  location: string | null;
}

export interface FighterRef {
  name: string;
  record: string;
  ufcStatsId: string | null;
}

export interface FightSummary {
  id: string;
  weightClass: string;
  order: number;
  isMain: boolean;
  fighterA: FighterRef;
  fighterB: FighterRef;
}

export interface FighterFull {
  name: string;
  record: string;
  reach: string | null;
  height: string | null;
  age: number | null;
  stance: string | null;
  style: string;
  slpm: number | null;
  strAcc: number | null;
  strDef: number | null;
  tdAvg: number | null;
  tdAcc: number | null;
  tdDef: number | null;
  subAvg: number | null;
  recentForm: string[];
  strengths: string[];
  weaknesses: string[];
  opponents: string[];
}

function extractFighterId(href: string): string | null {
  const m = href?.match(/fighter-details\/([a-f0-9]+)/i);
  return m ? m[1] : null;
}

function extractEventId(href: string): string | null {
  const m = href?.match(/event-details\/([a-f0-9]+)/i);
  return m ? m[1] : null;
}

function parsePercent(s: string): number | null {
  const cleaned = s?.replace("%", "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n / 100;
}

function parseNumber(s: string): number | null {
  const n = parseFloat(s?.trim());
  return isNaN(n) ? null : n;
}

function deriveStyle(stats: {
  slpm: number | null;
  tdAvg: number | null;
  subAvg: number | null;
  strAcc: number | null;
}): string {
  const { slpm, tdAvg, subAvg } = stats;
  const sl = slpm ?? 0;
  const td = tdAvg ?? 0;
  const sub = subAvg ?? 0;

  if (sub > 1.5 && td > 2) return "Submission specialist";
  if (td > 3 && sl < 3) return "Dominant wrestler";
  if (td > 2 && sl > 3) return "Well-rounded / pressure fighter";
  if (sl > 5 && td < 1.5) return "Aggressive striker";
  if (sl > 4) return "Technical striker";
  if (td > 2) return "Grappler / ground-and-pound";
  return "Balanced fighter";
}

function deriveStrengths(stats: FighterFull): string[] {
  const s: string[] = [];
  if ((stats.slpm ?? 0) > 4.5) s.push("High output striker");
  if ((stats.strAcc ?? 0) > 0.48) s.push("Accurate striking");
  if ((stats.strDef ?? 0) > 0.58) s.push("Good defensive striking");
  if ((stats.tdAvg ?? 0) > 2.5) s.push("Active wrestling");
  if ((stats.tdAcc ?? 0) > 0.45) s.push("Effective takedowns");
  if ((stats.tdDef ?? 0) > 0.75) s.push("Excellent takedown defense");
  if ((stats.subAvg ?? 0) > 0.8) s.push("Submission threat");
  return s.length ? s : ["Experienced competitor"];
}

function deriveWeaknesses(stats: FighterFull): string[] {
  const w: string[] = [];
  if ((stats.strDef ?? 1) < 0.5 && (stats.strDef ?? 1) > 0)
    w.push("Absorbs significant strikes");
  if ((stats.tdDef ?? 1) < 0.65 && (stats.tdDef ?? 1) > 0)
    w.push("Vulnerable to takedowns");
  if ((stats.strAcc ?? 1) < 0.4 && (stats.strAcc ?? 1) > 0)
    w.push("Low striking accuracy");
  return w;
}

export async function scrapeUpcomingEvents(): Promise<EventSummary[]> {
  logger.info("Scraping upcoming UFC events");
  const $ = await get(`${BASE}/statistics/events/upcoming`);
  const events: EventSummary[] = [];

  $(".b-statistics__table-row").each((_i, row) => {
    const link = $(row).find(".b-link.b-link_style_black").first();
    const name = link.text().trim();
    const href = link.attr("href") ?? "";
    const id = extractEventId(href);
    if (!id || !name) return;

    const cells = $(row).find("td");
    const date = $(cells[0]).text().trim();
    const location = $(cells[1]).text().trim() || null;

    events.push({ id, name, date, venue: null, location });
  });

  // Also try the simpler table format
  if (events.length === 0) {
    $("table.b-statistics__table tbody tr").each((_i, row) => {
      const link = $(row).find("a").first();
      const name = link.text().trim();
      const href = link.attr("href") ?? "";
      const id = extractEventId(href);
      if (!id || !name) return;
      const cells = $(row).find("td");
      const date = $(cells[0]).text().trim();
      const location = $(cells[1]).text().trim() || null;
      events.push({ id, name, date, venue: null, location });
    });
  }

  logger.info({ count: events.length }, "Scraped upcoming events");
  return events;
}

export async function scrapeEventCard(
  eventId: string
): Promise<{ event: Omit<EventSummary, "id">; fights: FightSummary[] }> {
  logger.info({ eventId }, "Scraping event card");
  const $ = await get(`${BASE}/event-details/${eventId}`);

  const name = $(".b-content__title-highlight").text().trim();
  const infoItems = $(".b-list__box-list-item");
  let date = "";
  let location: string | null = null;

  infoItems.each((_i, el) => {
    const label = $(el).find(".b-list__box-item-title").text().trim();
    const val = $(el).text().replace(label, "").trim();
    if (/date/i.test(label)) date = val;
    if (/location/i.test(label)) location = val;
  });

  const fights: FightSummary[] = [];
  let order = 0;

  $(".b-fight-details__table-row").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const fighterLinks = $(cells[0]).find("a");
    if (fighterLinks.length < 2) return;

    const nameA = $(fighterLinks[0]).text().trim();
    const hrefA = $(fighterLinks[0]).attr("href") ?? "";
    const nameB = $(fighterLinks[1]).text().trim();
    const hrefB = $(fighterLinks[1]).attr("href") ?? "";

    const weightClass = $(cells[6]).text().trim() || $(cells[1]).text().trim();
    const methodText = $(cells[7]).text().trim();

    // Extract records if available
    const recordA = $(cells[0]).find(".b-fight-details__table-col_record").first().text().trim() || "?-?";
    const recordB = $(cells[0]).find(".b-fight-details__table-col_record").last().text().trim() || "?-?";

    const idA = extractFighterId(hrefA);
    const idB = extractFighterId(hrefB);

    if (!nameA || !nameB) return;

    const fightId = `${eventId}_${order}`;
    const isMain = order === 0;

    fights.push({
      id: fightId,
      weightClass: weightClass || "Unknown",
      order,
      isMain,
      fighterA: {
        name: nameA,
        record: recordA,
        ufcStatsId: idA,
      },
      fighterB: {
        name: nameB,
        record: recordB,
        ufcStatsId: idB,
      },
    });

    order++;
  });

  return { event: { name, date, venue: null, location }, fights };
}

export async function scrapeFighterStats(fighterId: string): Promise<FighterFull | null> {
  logger.info({ fighterId }, "Scraping fighter stats");
  try {
    const $ = await get(`${BASE}/fighter-details/${fighterId}`);

    const name = $(".b-content__title-highlight").text().trim();
    const record = $(".b-content__title-record").text().replace("Record:", "").trim();

    // Parse biographical info
    let reach: string | null = null;
    let height: string | null = null;
    let age: number | null = null;
    let stance: string | null = null;

    $(".b-list__box-list-item").each((_i, el) => {
      const text = $(el).text().trim();
      if (/height/i.test(text)) height = text.replace(/height:\s*/i, "").trim() || null;
      if (/reach/i.test(text)) reach = text.replace(/reach:\s*/i, "").trim() || null;
      if (/stance/i.test(text)) stance = text.replace(/stance:\s*/i, "").trim() || null;
      if (/dob/i.test(text)) {
        const dobStr = text.replace(/dob:\s*/i, "").trim();
        if (dobStr && dobStr !== "--") {
          const dob = new Date(dobStr);
          if (!isNaN(dob.getTime())) {
            age = new Date().getFullYear() - dob.getFullYear();
          }
        }
      }
    });

    // Parse career stats
    let slpm: number | null = null;
    let strAcc: number | null = null;
    let strDef: number | null = null;
    let tdAvg: number | null = null;
    let tdAcc: number | null = null;
    let tdDef: number | null = null;
    let subAvg: number | null = null;

    // Stats in the career statistics boxes
    $(".b-list__box-list--long .b-list__box-list-item").each((_i, el) => {
      const label = $(el).find(".b-list__box-item-title").text().trim().toLowerCase();
      const val = $(el).text().replace($(el).find(".b-list__box-item-title").text(), "").trim();

      if (/slpm/i.test(label)) slpm = parseNumber(val);
      if (/str\.\s*acc/i.test(label) || /striking accuracy/i.test(label)) strAcc = parsePercent(val);
      if (/str\.\s*def/i.test(label) || /striking defence/i.test(label)) strDef = parsePercent(val);
      if (/td avg/i.test(label) || /takedowns average/i.test(label)) tdAvg = parseNumber(val);
      if (/td acc/i.test(label) || /takedown accuracy/i.test(label)) tdAcc = parsePercent(val);
      if (/td def/i.test(label) || /takedown defence/i.test(label)) tdDef = parsePercent(val);
      if (/sub\.\s*avg/i.test(label) || /submission average/i.test(label)) subAvg = parseNumber(val);
    });

    // Try alternative layout
    if (slpm === null) {
      $(".b-list__box-list-item").each((_i, el) => {
        const text = $(el).text();
        if (/slpm/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) slpm = parseNumber(parts[1]);
        }
        if (/str\. acc/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) strAcc = parsePercent(parts[1]);
        }
        if (/str\. def/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) strDef = parsePercent(parts[1]);
        }
        if (/td avg/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) tdAvg = parseNumber(parts[1]);
        }
        if (/td acc/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) tdAcc = parsePercent(parts[1]);
        }
        if (/td def/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) tdDef = parsePercent(parts[1]);
        }
        if (/sub\. avg/i.test(text)) {
          const parts = text.split(":");
          if (parts[1]) subAvg = parseNumber(parts[1]);
        }
      });
    }

    // Scrape recent fight history (last 5)
    const recentForm: string[] = [];
    const opponents: string[] = [];

    $(".b-fight-details__table-row").each((i, row) => {
      if (i >= 5) return false; // stop after 5 fights
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const result = $(cells[0]).text().trim().toUpperCase();
      const oppName = $(cells[1]).find("a").text().trim();
      const method = $(cells[7]).text().trim();
      if (result && oppName) {
        recentForm.push(`${result} (${method || "?"})`);
        opponents.push(oppName.toLowerCase());
      }
    });

    const statsObj = { slpm, strAcc, strDef, tdAvg, tdAcc, tdDef, subAvg, recentForm, opponents };
    const style = deriveStyle({ slpm, tdAvg, subAvg, strAcc });
    const partial = { name, record, reach: reach || null, height: height || null, age, stance: stance || null, style, ...statsObj };
    const strengths = deriveStrengths(partial as FighterFull);
    const weaknesses = deriveWeaknesses(partial as FighterFull);

    return {
      ...partial,
      strengths,
      weaknesses,
    };
  } catch (err) {
    logger.error({ fighterId, err }, "Failed to scrape fighter stats");
    return null;
  }
}

export async function findCommonOpponents(
  opponentsA: string[],
  opponentsB: string[]
): Promise<string[]> {
  const setA = new Set(opponentsA.map((o) => o.toLowerCase()));
  return opponentsB.filter((o) => setA.has(o.toLowerCase()));
}
