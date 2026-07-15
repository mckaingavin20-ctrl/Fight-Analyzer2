import cron from "node-cron";
import { logger } from "./logger.js";
import { getUpcomingEspnEvents, eventDateWindow } from "./espn.js";
import { fetchAllOddsFights } from "./odds.js";
import { generateDeepAnalysis, clearDiskCache } from "./ai-analyzer.js";

let isRunning = false;

async function runDailyRefresh(): Promise<void> {
  if (isRunning) {
    logger.info("Daily refresh already in progress, skipping");
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

    // Deduplicate by fight id
    const unique = [...new Map(toAnalyze.map((f) => [f.id, f])).values()];
    logger.info({ count: unique.length }, "Daily refresh: pre-generating analyses");

    // Process sequentially to avoid hammering OpenAI rate limits
    for (const fight of unique) {
      try {
        await generateDeepAnalysis(fight, "MMA");
        logger.info({ fightId: fight.id, fighters: `${fight.fighterA} vs ${fight.fighterB}` }, "Pre-generated");
        // Pause between calls to stay within rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "insufficient_quota") {
          logger.error("OpenAI quota exhausted — stopping daily refresh early. Add credits at platform.openai.com.");
          break; // Don't burn retries on a quota error
        }
        logger.error({ err, fightId: fight.id }, "Failed to pre-generate analysis");
      }
    }

    logger.info("Daily refresh complete");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule daily analysis refresh at 06:00 UTC.
 * Also runs immediately on startup so the cache is warm from the first request.
 */
export function scheduleDailyRefresh(): void {
  // Run once at startup (non-blocking)
  setTimeout(() => {
    runDailyRefresh().catch((err) =>
      logger.error({ err }, "Startup refresh failed")
    );
  }, 5000); // 5s delay so server is fully ready

  // Schedule daily at 06:00 UTC
  cron.schedule("0 6 * * *", () => {
    logger.info("Daily cron triggered");
    runDailyRefresh().catch((err) =>
      logger.error({ err }, "Scheduled refresh failed")
    );
  });

  logger.info("Daily refresh scheduled (06:00 UTC + startup warmup)");
}
