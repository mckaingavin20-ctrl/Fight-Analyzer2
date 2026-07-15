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

let calendarCache: { data: EspnEvent[]; at: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function extractEventId(ref: string): string | null {
  const m = ref?.match(/events\/(\d+)/);
  return m ? m[1] : null;
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
  const events: EspnEvent[] = [];

  for (const entry of calendar) {
    const startDate = new Date(entry.startDate);
    if (startDate <= now) continue; // skip past events

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

export function eventDateWindow(
  eventDate: string
): { from: Date; to: Date } {
  const d = new Date(eventDate);
  const from = new Date(d.getTime() - 4 * 60 * 60 * 1000);   // 4h before
  const to   = new Date(d.getTime() + 18 * 60 * 60 * 1000);  // 18h after
  return { from, to };
}
