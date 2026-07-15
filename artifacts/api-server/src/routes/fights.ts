import { Router } from "express";
import { fetchAllOddsFights, decimalToAmerican } from "../lib/odds.js";
import { analyzeFromOdds } from "../lib/analyzer.js";
import { logger } from "../lib/logger.js";

const router = Router();
const analysisCache = new Map<string, { data: unknown; at: number }>();
const CACHE_TTL = 10 * 60 * 1000;

router.get("/fights/:fightId/analysis", async (req, res) => {
  const { fightId } = req.params;

  const cached = analysisCache.get(fightId);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return res.json(cached.data);
  }

  const allFights = await fetchAllOddsFights();
  const fight = allFights.find((f) => f.id === fightId);

  if (!fight) {
    return res.status(404).json({ error: `Fight ${fightId} not found` });
  }

  const lean = analyzeFromOdds(fight);

  const americanA = fight.oddsA ? decimalToAmerican(fight.oddsA) : "N/A";
  const americanB = fight.oddsB ? decimalToAmerican(fight.oddsB) : "N/A";

  const result = {
    fightId,
    weightClass: "MMA",
    fighterA: {
      name: fight.fighterA,
      record: "–",
      reach: null,
      height: null,
      age: null,
      stance: null,
      style: "Fighter",
      slpm: null,
      strAcc: null,
      strDef: null,
      tdAvg: null,
      tdAcc: null,
      tdDef: null,
      subAvg: null,
      recentForm: [],
      strengths: [],
      weaknesses: [],
    },
    fighterB: {
      name: fight.fighterB,
      record: "–",
      reach: null,
      height: null,
      age: null,
      stance: null,
      style: "Fighter",
      slpm: null,
      strAcc: null,
      strDef: null,
      tdAvg: null,
      tdAcc: null,
      tdDef: null,
      subAvg: null,
      recentForm: [],
      strengths: [],
      weaknesses: [],
    },
    commonOpponents: [],
    odds: fight.oddsA && fight.oddsB
      ? {
          fighterA: americanA,
          fighterB: americanB,
          book: fight.book,
        }
      : null,
    lean,
    sources: [
      { label: "The Odds API", url: "https://the-odds-api.com" },
      {
        label: "ESPN UFC",
        url: "https://www.espn.com/mma/",
      },
    ],
  };

  analysisCache.set(fightId, { data: result, at: Date.now() });
  logger.info({ fightId, fighter: lean.fighter, confidence: lean.confidence }, "Analysis cached");
  return res.json(result);
});

export default router;
