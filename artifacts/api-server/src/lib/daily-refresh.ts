import cron from "node-cron";
import { logger } from "./logger.js";
import { getUpcomingEspnEvents, getEspnEventCard, getEspnBoutResults, eventDateWindow, clearEspnCaches } from "./espn.js";
import { fetchAllOddsFights } from "./odds.js";
import { batchGenerateAnalyses, clearDiskCache } from "./ai-analyzer.js";
import { getPendingResolvedNeeded, resolvePickResult } from "./picks-tracker.js";
import type { OddsFight } from "./odds.js";

let isRunning = false;

/** Fuzzy name match — strips non-alpha and compares */
function nameSim(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const na = n(a), nb = n(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Check ESPN results for pending picks. Pass force=true to bypass the time gate. */
async function resolveCompletedPicks(force = false): Promise<void> {
  const pending = getPendingResolvedNeeded(force);
  if (pending.length === 0) {
    logger.info("No pending picks to resolve");
    return;
  }

  logger.info({ count: pending.length }, "Resolving completed picks");

  // Group by event date to minimise ESPN API calls
  const byDate = new Map<string, typeof pending>();
  for (const pick of pending) {
    const key = pick.eventDate.slice(0, 10); // YYYY-MM-DD
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(pick);
  }

  for (const [, picks] of byDate) {
    const eventDate = picks[0].eventDate;
    let bouts: Awaited<ReturnType<typeof getEspnBoutResults>>;
    try {
      bouts = await getEspnBoutResults(eventDate);
    } catch (err) {
      logger.warn({ err, eventDate }, "Failed to fetch ESPN results for date");
      continue;
    }

    for (const pick of picks) {
      // Find the ESPN bout that matches this fight's two fighters
      const bout = bouts.find(
        (b) =>
          (nameSim(b.fighterA, pick.fighterPicked) && nameSim(b.fighterB, pick.opponent)) ||
          (nameSim(b.fighterB, pick.fighterPicked) && nameSim(b.fighterA, pick.opponent))
      );

      if (!bout) {
        logger.info({ fightId: pick.fightId }, "No ESPN result yet for pick — will retry next refresh");
        continue;
      }

      if (!bout.winner) {
        logger.info({ fightId: pick.fightId }, "ESPN bout has no winner yet");
        continue;
      }

      const won = nameSim(bout.winner, pick.fighterPicked);
      resolvePickResult(pick.fightId, won ? "win" : "loss");
    }
  }
}

async function runDailyRefresh(): Promise<void> {
  if (isRunning) {
    logger.info("Daily refresh already running — skipping");
    return;
  }
  isRunning = true;

  try {
    logger.info("Daily refresh: refreshing event/card data (analysis picks preserved)");
    // DO NOT clear analysis cache — picks must stay locked once made.
    // batchGenerateAnalyses() already skips any fight that has a cached analysis.
    clearEspnCaches(); // force re-fetch of event calendar + new fight announcements

    // Re-fetch everything fresh
    const [events, allOddsFights] = await Promise.all([
      getUpcomingEspnEvents(),
      fetchAllOddsFights(),
    ]);

    logger.info({ count: events.length }, "Daily refresh: events found");

    // Collect fights across all upcoming events using two-tier approach:
    // 1. ESPN bout lineup (UFC-only, most accurate)
    // 2. Odds API fallback for events ESPN hasn't announced yet
    const fightMap = new Map<string, OddsFight>();

    for (const ev of events) {
      const { from, to } = eventDateWindow(ev.date);

      // Odds fights in this event's time window
      const windowOdds = allOddsFights.filter((f) => {
        const t = new Date(f.commenceTime);
        return t >= from && t <= to;
      });

      // Always warm the ESPN card cache — even for events with no odds yet
      let espnBouts: Awaited<ReturnType<typeof getEspnEventCard>> = [];
      try {
        espnBouts = await getEspnEventCard(ev.id, ev.date);
      } catch (err) {
        logger.warn({ err, eventId: ev.id }, "ESPN card fetch failed during refresh");
      }

      // Only queue AI analysis when odds are available (needed for pick generation)
      if (windowOdds.length === 0) continue;

      if (espnBouts.length > 0) {
        // Match ESPN bouts to Odds API fights for the fight ID
        for (const bout of espnBouts) {
          const match = windowOdds.find((f) => {
            const sim = (a: string, b: string) => {
              const na = a.toLowerCase().replace(/[^a-z]/g, "");
              const nb = b.toLowerCase().replace(/[^a-z]/g, "");
              return na === nb || na.includes(nb) || nb.includes(na);
            };
            return (
              (sim(bout.fighterA.name, f.fighterA) && sim(bout.fighterB.name, f.fighterB)) ||
              (sim(bout.fighterA.name, f.fighterB) && sim(bout.fighterB.name, f.fighterA))
            );
          });
          if (match) fightMap.set(match.id, match);
        }
      } else {
        // Fallback: use Odds API fights directly (future event, card not announced yet)
        for (const f of windowOdds) fightMap.set(f.id, f);
      }
    }

    const unique = [...fightMap.values()];
    logger.info({ count: unique.length }, "Daily refresh: pre-generating analyses");
    await batchGenerateAnalyses(unique);

    // ── Resolve results for past picks ────────────────────────────────
    await resolveCompletedPicks();

    logger.info("Daily refresh complete");
  } catch (err) {
    logger.error({ err }, "Daily refresh failed");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule daily analysis refresh at 06:00 UTC.
 * Also schedule a lightweight resolve-only pass every 30 minutes for
 * same-day result tracking (so picks resolve on fight night, not next morning).
 */
export function scheduleDailyRefresh(): void {
  // Full refresh: re-fetch events, odds, analyses, then resolve picks
  cron.schedule("0 6 * * *", () => {
    logger.info("06:00 UTC daily refresh triggered");
    runDailyRefresh().catch((err) =>
      logger.error({ err }, "Scheduled daily refresh crashed")
    );
  });

  // Lightweight: resolve completed picks every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    resolveCompletedPicks().catch((err) =>
      logger.warn({ err }, "30-min resolve pass failed")
    );
  });

  logger.info("Daily refresh scheduled for 06:00 UTC; resolve pass every 30 min");
}

/** Manually trigger a full refresh — exposed to admin route. */
export { runDailyRefresh };

/** Manually trigger picks resolution only — exposed to admin route. */
export { resolveCompletedPicks };
