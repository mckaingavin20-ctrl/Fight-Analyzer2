import { Router } from "express";
import { fetchAllOddsFights, decimalToAmerican } from "../lib/odds.js";
import { generateDeepAnalysis } from "../lib/ai-analyzer.js";
import { logger } from "../lib/logger.js";

const router = Router();

// In-memory request deduplication: prevents two simultaneous requests
// for the same fight from both spawning an AI call
const inFlight = new Map<string, Promise<unknown>>();

router.get("/fights/:fightId/analysis", async (req, res) => {
  const { fightId } = req.params;

  const allFights = await fetchAllOddsFights();
  const fight = allFights.find((f) => f.id === fightId);

  if (!fight) {
    return res.status(404).json({ error: `Fight ${fightId} not found` });
  }

  // Deduplicate concurrent requests
  if (!inFlight.has(fightId)) {
    const promise = generateDeepAnalysis(fight, "MMA").finally(() => {
      inFlight.delete(fightId);
    });
    inFlight.set(fightId, promise);
  }

  try {
    const analysis = await inFlight.get(fightId)! as Awaited<ReturnType<typeof generateDeepAnalysis>>;

    const americanA = fight.oddsA ? decimalToAmerican(fight.oddsA) : "N/A";
    const americanB = fight.oddsB ? decimalToAmerican(fight.oddsB) : "N/A";

    return res.json({
      fightId,
      weightClass: "MMA",
      fighterA: {
        name: fight.fighterA,
        record: "–",
        reach: null,
        height: null,
        age: null,
        stance: analysis.fighterAProfile?.style ?? null,
        style: analysis.fighterAProfile?.style ?? "Fighter",
        slpm: null,
        strAcc: null,
        strDef: null,
        tdAvg: null,
        tdAcc: null,
        tdDef: null,
        subAvg: null,
        recentForm: analysis.fighterAProfile?.recentForm ?? [],
        strengths: analysis.fighterAProfile?.strengths ?? [],
        weaknesses: analysis.fighterAProfile?.weaknesses ?? [],
      },
      fighterB: {
        name: fight.fighterB,
        record: "–",
        reach: null,
        height: null,
        age: null,
        stance: analysis.fighterBProfile?.style ?? null,
        style: analysis.fighterBProfile?.style ?? "Fighter",
        slpm: null,
        strAcc: null,
        strDef: null,
        tdAvg: null,
        tdAcc: null,
        tdDef: null,
        subAvg: null,
        recentForm: analysis.fighterBProfile?.recentForm ?? [],
        strengths: analysis.fighterBProfile?.strengths ?? [],
        weaknesses: analysis.fighterBProfile?.weaknesses ?? [],
      },
      commonOpponents: (analysis.commonOpponents ?? []).map((co) => ({
        opponent: co.opponent,
        resultA: co.resultA,
        methodA: co.methodA,
        resultB: co.resultB,
        methodB: co.methodB,
        notes: co.notes ?? null,
      })),
      odds: fight.oddsA && fight.oddsB
        ? { fighterA: americanA, fighterB: americanB, book: fight.book }
        : null,
      lean: {
        fighter: analysis.fighter,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyEdges: analysis.keyEdges ?? [],
        riskFactors: analysis.riskFactors ?? [],
      },
      styleMatchup: analysis.styleMatchup ?? null,
      upsetAnalysis: analysis.upsetAnalysis ?? null,
      sources: [
        { label: "Replit AI", url: "https://replit.com" },
        { label: "The Odds API", url: "https://the-odds-api.com" },
      ],
    });
  } catch (err) {
    logger.error({ err, fightId }, "AI analysis failed");
    return res.status(500).json({ error: "Analysis generation failed. Check your OPENAI_API_KEY." });
  }
});

export default router;
