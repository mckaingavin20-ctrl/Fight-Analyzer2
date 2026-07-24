import axios from "axios";
import { logger } from "./logger.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc";

interface EspnCalendarEntry {
  label: string;
  startDate: string;
  endDate: string;
  event?: { $ref: string };
}

export interface EspnEvent {
  id: string;
  name: string;
  date: string;         // ISO date string
  venue: string | null;
  location: string | null;
}

export interface EspnBout {
  boutUid: string;      // unique competition UID
  date: string;         // ISO datetime of this bout
  espnOrder: number;    // original ESPN array index (0 = first prelim, N = main event)
  fighterA: { espnId: string; name: string };
  fighterB: { espnId: string; name: string };
}

let calendarCache: { data: EspnEvent[]; at: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// Per-event card cache: eventId -> bouts
const cardCache = new Map<string, { data: EspnBout[]; at: number }>();
const CARD_CACHE_TTL = 15 * 60 * 1000; // 15 min

export function clearEspnCaches(): void {
  calendarCache = null;
  cardCache.clear();
}

function extractEventId(ref: string): string | null {
  const m = ref?.match(/events\/(\d+)/);
  return m ? m[1] : null;
}

function dateStr(d: Date): string {
  // YYYYMMDD in UTC
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function getUpcomingEspnEvents(): Promise<EspnEvent[]> {
  if (calendarCache && Date.now() - calendarCache.at < CACHE_TTL) {
    return calendarCache.data;
  }

  const res = await axios.get<unknown>(`${ESPN_BASE}/scoreboard`, {
    timeout: 12000,
  });

  const data = res.data as Record<string, unknown>;
  const leagues = (data.leagues as Record<string, unknown>[] | undefined) ?? [];
  const calendar =
    (leagues[0]?.calendar as EspnCalendarEntry[] | undefined) ?? [];

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // keep events from last 24h
  const events: EspnEvent[] = [];

  for (const entry of calendar) {
    const startDate = new Date(entry.startDate);
    if (startDate < cutoff) continue; // drop events older than 24h

    // Filter to actual UFC/Contender events (skip internal calendar noise)
    const name = entry.label ?? "";
    const isUfc =
      name.toLowerCase().includes("ufc") ||
      name.toLowerCase().includes("dana white");

    if (!isUfc) continue;

    const ref = entry.event?.["$ref"] ?? "";
    const id = extractEventId(ref) ?? `date-${entry.startDate}`;

    events.push({
      id,
      name,
      date: entry.startDate,
      venue: null,
      location: null,
    });
  }

  logger.info({ count: events.length }, "Fetched UFC events from ESPN");
  calendarCache = { data: events, at: Date.now() };
  return events;
}

/**
 * Fetch the actual bout lineup for a specific UFC event from ESPN.
 * Uses the /events?dates= endpoint which returns real UFC bouts (not other promotions).
 * Queries the event date and the day before (UTC timezone boundary).
 */
export async function getEspnEventCard(
  eventId: string,
  eventDate: string
): Promise<EspnBout[]> {
  const cached = cardCache.get(eventId);
  if (cached && Date.now() - cached.at < CARD_CACHE_TTL) {
    return cached.data;
  }

  const d = new Date(eventDate);
  const dayBefore = new Date(d.getTime() - 24 * 60 * 60 * 1000);

  // Query both dates to handle UTC boundary issues (events at 21:00 UTC show on the prior day)
  const dates = Array.from(new Set([dateStr(dayBefore), dateStr(d)]));

  interface EspnCompetitor {
    id: string;
    displayName: string;
    homeAway: string;
  }
  interface EspnBoutRaw {
    id: string;
    uid: string;
    date: string;
    competitors: EspnCompetitor[];
  }
  interface EspnEventsResponse {
    events?: EspnBoutRaw[];
  }

  const boutMap = new Map<string, EspnBout>(); // keyed by boutUid

  for (const dateParam of dates) {
    try {
      const res = await axios.get<EspnEventsResponse>(
        `${ESPN_BASE}/events`,
        { params: { dates: dateParam }, timeout: 12000 }
      );
      const bouts = res.data.events ?? [];
      for (const b of bouts) {
        if (b.id !== eventId) continue; // only bouts for this UFC event
        if (boutMap.has(b.uid)) continue; // dedup

        const home = b.competitors.find((c) => c.homeAway === "home") ?? b.competitors[0];
        const away = b.competitors.find((c) => c.homeAway === "away") ?? b.competitors[1];
        if (!home || !away) continue;

        boutMap.set(b.uid, {
          boutUid: b.uid,
          date: b.date,
          espnOrder: boutMap.size, // preserves original ESPN array order
          fighterA: { espnId: home.id, name: home.displayName },
          fighterB: { espnId: away.id, name: away.displayName },
        });
      }
    } catch (err) {
      logger.warn({ err, dateParam }, "ESPN events fetch failed for date");
    }
  }

  const bouts = Array.from(boutMap.values());
  logger.info({ eventId, count: bouts.length }, "Fetched UFC event card from ESPN");
  cardCache.set(eventId, { data: bouts, at: Date.now() });
  return bouts;
}

/**
 * Fetch completed bout results for a past event date.
 * Uses the /scoreboard endpoint which returns per-competition results with athlete names.
 * Checks the day before, event day, and day after to catch late-night main cards that
 * ESPN timestamps on the next UTC day.
 * Returns array of { fighterA, fighterB, winner } — winner is null if fight not yet completed.
 */
export async function getEspnBoutResults(
  eventDate: string
): Promise<Array<{ fighterA: string; fighterB: string; winner: string | null }>> {
  const d = new Date(eventDate);
  const dayBefore = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  const dayAfter  = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const dates = Array.from(new Set([dateStr(dayBefore), dateStr(d), dateStr(dayAfter)]));

  interface EspnCompetitor {
    homeAway?: string;
    winner?: boolean;
    athlete?: { displayName?: string };
    displayName?: string;
  }
  interface EspnCompetition {
    id: string;
    competitors?: EspnCompetitor[];
  }
  interface EspnScoreboardEvent {
    id: string;
    competitions?: EspnCompetition[];
  }
  interface EspnScoreboardResponse {
    events?: EspnScoreboardEvent[];
  }

  const seen = new Set<string>(); // dedup by competition id
  const results: Array<{ fighterA: string; fighterB: string; winner: string | null }> = [];

  for (const dateParam of dates) {
    try {
      // /scoreboard returns per-competition entries with athlete.displayName
      const res = await axios.get<EspnScoreboardResponse>(`${ESPN_BASE}/scoreboard`, {
        params: { dates: dateParam },
        timeout: 12000,
      });
      for (const ev of res.data.events ?? []) {
        for (const comp of ev.competitions ?? []) {
          if (seen.has(comp.id)) continue;
          seen.add(comp.id);
          const cs = comp.competitors ?? [];
          // Name lives in competitor.athlete.displayName; fall back to top-level displayName
          const getName = (c: EspnCompetitor) =>
            c.athlete?.displayName ?? c.displayName ?? "";
          const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
          const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
          if (!home || !away) continue;
          const winnerComp = cs.find((c) => c.winner === true);
          results.push({
            fighterA: getName(home),
            fighterB: getName(away),
            winner: winnerComp ? getName(winnerComp) : null,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, dateParam }, "ESPN scoreboard results fetch failed for date");
    }
  }

  logger.info({ count: results.length, dates }, "ESPN bout results fetched from scoreboard");
  return results;
}

export function eventDateWindow(
  eventDate: string
): { from: Date; to: Date } {
  const d = new Date(eventDate);
  const from = new Date(d.getTime() - 4 * 60 * 60 * 1000);   // 4h before
  const to   = new Date(d.getTime() + 18 * 60 * 60 * 1000);  // 18h after
  return { from, to };
}
