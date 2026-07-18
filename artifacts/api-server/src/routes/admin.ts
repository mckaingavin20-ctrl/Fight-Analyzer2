import { Router } from "express";
import { runDailyRefresh, resolveCompletedPicks } from "../lib/daily-refresh.js";
import { getPicksStats } from "../lib/picks-tracker.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /admin/resolve
 * Immediately check ESPN for results on all pending picks and resolve them.
 * Use this right after a fight card finishes.
 */
router.post("/admin/resolve", async (_req, res) => {
  logger.info("Manual resolve triggered via admin endpoint (force=true)");
  try {
    // force=true bypasses the time gate so results post the moment ESPN has them
    await resolveCompletedPicks(true);
    res.json({ ok: true, record: getPicksStats() });
  } catch (err) {
    logger.error({ err }, "Manual resolve failed");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /admin/refresh
 * Full daily refresh: re-fetches events, odds, pre-generates analyses, resolves picks.
 * Long-running — responds immediately and runs in background.
 */
router.post("/admin/refresh", (_req, res) => {
  logger.info("Manual full refresh triggered via admin endpoint");
  runDailyRefresh().catch((err) =>
    logger.error({ err }, "Manual refresh failed")
  );
  res.json({ ok: true, message: "Refresh started in background" });
});

export default router;
