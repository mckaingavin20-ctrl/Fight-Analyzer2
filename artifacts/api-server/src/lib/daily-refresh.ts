import cron from "node-cron";
import { logger } from "./logger.js";
import { getUpcomingEspnEvents, eventDateWindow } from "./espn.js";
import { fetchAllOddsFights } from "./odds.js";
import { batchGenerateAnalyses, clearDiskCache } from "./ai-analyzer.js";

let isRunning = false;

async function runDailyRefresh(): Promise<void> {
  if (isRunning) {
    logger.info("Daily refresh already running — skipping");
    return;
  }
  isRunning = true;

  try {
    logger.info("Daily refresh: clearing stale cache");
    clearDiskCache();

    const [events, allFights] = await Promise.all([
      getUpcomingEspnEvents(),
      fetchAllOddsFights(),
    ]);

    // Collect all fights across all upcoming events
    const toAnalyze: typeof allFights = [];
    for (const ev of events) {
      const { from, to } = eventDateWindow(ev.date);
      const card = allFights.filter((f) => {
        const t = new Date(f.commenceTime);
        return t >= from && t <= to;
      });
      toAnalyze.push(...card);
    }

    // Deduplicate
    const unique = [...new Map(toAnalyze.map((f) => [f.id, f])).values()];

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
 * On-demand requests build the cache the first time any fight is opened.
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
