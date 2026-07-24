import { Router } from "express";
import { fetchAllOddsFights, decimalToAmerican } from "../lib/odds.js";
import { generateDeepAnalysis, readDiskCache } from "../lib/ai-analyzer.js";
import type { DeepAnalysis } from "../lib/ai-analyzer.js";
import { logger } from "../lib/logger.js";

const router = Router();

// In-memory request deduplication
const inFlight = new Map<string, Promise<unknown>>();

/** Build a standard analysis response payload from a DeepAnalysis + optional live odds */
function buildAnalysisResponse(
  fightId: string,
  liveFight: { fighterA: string; fighterB: string; oddsA: number | null; oddsB: number | null; book: string } | null,
  analysis: DeepAnalysis
) {
  const nameA = liveFight?.fighterA ?? analysis.fighterAProfile?.name ?? "Fighter A";
  const nameB = liveFight?.fighterB ?? analysis.fighterBProfile?.name ?? "Fighter B";

  const americanA = liveFight?.oddsA ? decimalToAmerican(liveFight.oddsA) : null;
  const americanB = liveFight?.oddsB ? decimalToAmerican(liveFight.oddsB) : null;

  return {
    fightId,
    weightClass: "MMA",
    fighterA: {
      name: nameA,
      record: "–", reach: null, height: null, age: null,
      stance: analysis.fighterAProfile?.style ?? null,
      style:  analysis.fighterAProfile?.style ?? "Fighter",
      slpm: null, strAcc: null, strDef: null,
      tdAvg: null, tdAcc: null, tdDef: null, subAvg: null,
      recentForm: analysis.fighterAProfile?.recentForm ?? [],
      strengths:  analysis.fighterAProfile?.strengths  ?? [],
      weaknesses: analysis.fighterAProfile?.weaknesses ?? [],
    },
    fighterB: {
      name: nameB,
      record: "–", reach: null, height: null, age: null,
      stance: analysis.fighterBProfile?.style ?? null,
      style:  analysis.fighterBProfile?.style ?? "Fighter",
      slpm: null, strAcc: null, strDef: null,
      tdAvg: null, tdAcc: null, tdDef: null, subAvg: null,
      recentForm: analysis.fighterBProfile?.recentForm ?? [],
      strengths:  analysis.fighterBProfile?.strengths  ?? [],
      weaknesses: analysis.fighterBProfile?.weaknesses ?? [],
    },
    commonOpponents: (analysis.commonOpponents ?? []).map(co => ({
      opponent: co.opponent,
      resultA: co.resultA, methodA: co.methodA,
      resultB: co.resultB, methodB: co.methodB,
      notes: co.notes ?? null,
    })),
    odds: (americanA && americanB && liveFight)
      ? { fighterA: americanA, fighterB: americanB, book: liveFight.book }
      : null,
    lean: {
      fighter:     analysis.fighter,
      confidence:  analysis.confidence,
      reasoning:   analysis.reasoning,
      keyEdges:    analysis.keyEdges    ?? [],
      riskFactors: analysis.riskFactors ?? [],
    },
    styleMatchup:  analysis.styleMatchup  ?? null,
    upsetAnalysis: analysis.upsetAnalysis ?? null,
    sherdogUsed:   analysis.sherdogUsed   ?? { fighterA: false, fighterB: false },
    sources: [{ label: "Replit AI", url: "https://replit.com" }],
  };
}

router.get("/fights/:fightId/analysis", async (req, res) => {
  const rawId = req.params.fightId;
  const fightId = decodeURIComponent(rawId);

  // ── ESPN-only fights: name-based ID (espn_NameA~~NameB) ──────────────
  if (fightId.startsWith("espn_")) {
    // Serve from cache first
    const cached = readDiskCache(fightId);
    if (cached) {
      logger.info({ fightId }, "ESPN fight: serving disk cache");
      return res.json(buildAnalysisResponse(fightId, null, cached));
    }

    // Parse fighter names embedded in ID
    const namesPart = fightId.slice(5);
    const tilde = namesPart.indexOf("~~");
    if (tilde === -1) return res.status(400).json({ error: "Malformed ESPN fight ID" });
    const nameA = namesPart.slice(0, tilde);
    const nameB = namesPart.slice(tilde + 2);
    if (!nameA || !nameB) return res.status(400).json({ error: "Could not parse fighter names" });

    logger.info({ fightId, nameA, nameB }, "ESPN-only fight: generating analysis without odds");

    if (!inFlight.has(fightId)) {
      const synth = { id: fightId, commenceTime: new Date().toISOString(), fighterA: nameA, fighterB: nameB, oddsA: null as number | null, oddsB: null as number | null, book: "N/A" };
      const promise = generateDeepAnalysis(synth, "MMA").finally(() => inFlight.delete(fightId));
      inFlight.set(fightId, promise);
    }
    try {
      const analysis = await inFlight.get(fightId)! as DeepAnalysis;
      return res.json(buildAnalysisResponse(fightId, null, analysis));
    } catch (err) {
      logger.error({ err, fightId }, "ESPN fight analysis failed");
      return res.status(500).json({ error: "Analysis generation failed." });
    }
  }

  // ── Live odds-feed fights ─────────────────────────────────────────────
  const allFights = await fetchAllOddsFights();
  const fight = allFights.find(f => f.id === fightId);

  if (!fight) {
    // Completed fight — serve from disk cache
    const cached = readDiskCache(fightId);
    if (!cached) return res.status(404).json({ error: `Fight ${fightId} not found` });
    logger.info({ fightId }, "Completed fight: serving disk cache");
    return res.json(buildAnalysisResponse(fightId, null, cached));
  }

  // Deduplicate concurrent requests
  if (!inFlight.has(fightId)) {
    const promise = generateDeepAnalysis(fight, "MMA").finally(() => inFlight.delete(fightId));
    inFlight.set(fightId, promise);
  }

  try {
    const analysis = await inFlight.get(fightId)! as DeepAnalysis;
    return res.json(buildAnalysisResponse(fightId, fight, analysis));
  } catch (err) {
    logger.error({ err, fightId }, "AI analysis failed");
    return res.status(500).json({ error: "Analysis generation failed. Check your OPENAI_API_KEY." });
  }
});

export default router;
