import cron from "node-cron";
import { logger } from "./logger.js";
import { getUpcomingEspnEvents, getEspnEventCard, eventDateWindow, clearEspnCaches } from "./espn.js";
import { fetchAllOddsFights } from "./odds.js";
import { batchGenerateAnalyses, clearDiskCache } from "./ai-analyzer.js";
import type { OddsFight } from "./odds.js";

let isRunning = false;

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
    logger.info("Daily refresh complete");
  } catch (err) {
    logger.error({ err }, "Daily refresh failed");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule daily analysis refresh at 06:00 UTC.
 * Clears all caches (ESPN, analysis) and re-fetches everything fresh.
 */
export function scheduleDailyRefresh(): void {
  cron.schedule("0 6 * * *", () => {
    logger.info("06:00 UTC daily refresh triggered");
    runDailyRefresh().catch((err) =>
      logger.error({ err }, "Scheduled daily refresh crashed")
    );
  });

  logger.info("Daily refresh scheduled for 06:00 UTC");
}
