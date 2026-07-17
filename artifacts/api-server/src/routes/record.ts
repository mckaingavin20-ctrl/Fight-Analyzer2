import { Router } from "express";
import { getPicksStats } from "../lib/picks-tracker.js";

const router = Router();

router.get("/record", (_req, res) => {
  const stats = getPicksStats();
  return res.json(stats);
});

export default router;
