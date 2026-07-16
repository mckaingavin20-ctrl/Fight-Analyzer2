import cron from "node-cron";
import { logger } from "./logger.js";
import { getUpcomingEspnEvents, eventDateWindow } from "./espn.js";
import { fetchAllOddsFights } from "./odds.js";
import { generateDeepAnalysis, clearDiskCache, readDiskCache } from "./ai-analyzer.js";

let isRunning = false;

async function runDailyRefresh(force = false): Promise<void> {
  if (isRunning) {
    logger.info("Daily refresh already running — skipping");
    return;
  }
  isRunning = true;

  try {
    if (force) {
      logger.info("Daily refresh: clearing stale cache");
      clearDiskCache();
    }

    const [events, allFights] = await Promise.all([
      getUpcomingEspnEvents(),
      fetchAllOddsFights(),
    ]);

    // Collect all fights across upcoming events
    const toAnalyze: typeof allFights = [];
    for (const ev of events) {
      const { from, to } = eventDateWindow(ev.date);
      const card = allFights.filter((f) => {
        const t = new Date(f.commenceTime);
        return t >= from && t <= to;
      });
      toAnalyze.push(...card);
    }

    // Deduplicate and skip already-cached fights
    const unique = [...new Map(toAnalyze.map((f) => [f.id, f])).values()];
    const needed = unique.filter((f) => !readDiskCache(f.id));

    logger.info({ total: unique.length, toGenerate: needed.length }, "Daily refresh: queuing analysis");

    // Process sequentially — semaphore in generateDeepAnalysis handles concurrency safety.
    // 8s between calls keeps us comfortably under Gemini free-tier 15 RPM.
    for (const fight of needed) {
      try {
        await generateDeepAnalysis(fight, "MMA");
        await new Promise((r) => setTimeout(r, 8000));
      } catch (err) {
        logger.error({ err, fightId: fight.id }, "Failed during daily refresh — continuing");
      }
    }

    logger.info("Daily refresh complete");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule daily analysis refresh at 06:00 UTC.
 * No startup warmup — the on-demand route handles first-load analysis.
 * The daily cron clears stale cache and pre-builds fresh analyses each morning.
 */
export function scheduleDailyRefresh(): void {
  // Daily at 06:00 UTC — clears cache and regenerates all fights
  cron.schedule("0 6 * * *", () => {
    logger.info("Daily 06:00 UTC refresh triggered");
    runDailyRefresh(true).catch((err) =>
      logger.error({ err }, "Scheduled refresh failed")
    );
  });

  logger.info("Daily refresh scheduled for 06:00 UTC (on-demand cache handles first loads)");
}
