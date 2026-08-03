import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fetchAllOddsFights, decimalToAmerican } from "../lib/odds.js";
import { generateDeepAnalysis, readDiskCache, readDiskCacheForce } from "../lib/ai-analyzer.js";
import type { DeepAnalysis } from "../lib/ai-analyzer.js";
import { logger } from "../lib/logger.js";

const ANALYSIS_CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../.cache/analysis"
);

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

  const isMain = req.query.main === "1";

  // ── ESPN-only fights: name-based ID (espn_NameA~~NameB) ──────────────
  if (fightId.startsWith("espn_")) {
    // Serve from cache first — use TTL-aware read so stale caches trigger regeneration
    const cached = readDiskCache(fightId, isMain);
    if (cached) {
      logger.info({ fightId, isMain }, "ESPN fight: serving disk cache");
      return res.json(buildAnalysisResponse(fightId, null, cached));
    }

    // Parse fighter names embedded in ID
    const namesPart = fightId.slice(5);
    const tilde = namesPart.indexOf("~~");
    if (tilde === -1) return res.status(400).json({ error: "Malformed ESPN fight ID" });
    const nameA = namesPart.slice(0, tilde);
    const nameB = namesPart.slice(tilde + 2);
    if (!nameA || !nameB) return res.status(400).json({ error: "Could not parse fighter names" });

    logger.info({ fightId, nameA, nameB, isMain }, "ESPN-only fight: generating analysis without odds");

    const espnInflightKey = `${fightId}:${isMain ? "main" : "prelim"}`;
    if (!inFlight.has(espnInflightKey)) {
      const synth = { id: fightId, commenceTime: new Date().toISOString(), fighterA: nameA, fighterB: nameB, oddsA: null as number | null, oddsB: null as number | null, book: "N/A", isMainEvent: isMain };
      const promise = generateDeepAnalysis(synth, "MMA").finally(() => inFlight.delete(espnInflightKey));
      inFlight.set(espnInflightKey, promise);
    }
    try {
      const analysis = await inFlight.get(espnInflightKey)! as DeepAnalysis;
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
    // Fight not in odds feed (event started or fight removed) — serve from disk cache.
    // Use force-read (bypass TTL) so we never 404 a completed pick.
    // Try main variant first if isMain, then fall back to base cache.
    const cached = readDiskCacheForce(fightId, isMain) ?? readDiskCacheForce(fightId, false);
    if (!cached) return res.status(404).json({ error: `Fight ${fightId} not found` });
    logger.info({ fightId, isMain }, "Completed fight: serving disk cache (TTL bypassed)");
    return res.json(buildAnalysisResponse(fightId, null, cached));
  }

  // Attach isMainEvent flag if front-end passes ?main=1
  const fightWithMeta = { ...fight, isMainEvent: isMain };

  // Deduplicate concurrent requests — key includes isMain so main/prelim don't share a promise
  const inflightKey = `${fightId}:${isMain ? "main" : "prelim"}`;
  if (!inFlight.has(inflightKey)) {
    const promise = generateDeepAnalysis(fightWithMeta, "MMA").finally(() => inFlight.delete(inflightKey));
    inFlight.set(inflightKey, promise);
  }

  try {
    const analysis = await inFlight.get(inflightKey)! as DeepAnalysis;
    return res.json(buildAnalysisResponse(fightId, fight, analysis));
  } catch (err) {
    logger.error({ err, fightId }, "AI analysis failed");
    return res.status(500).json({ error: "Analysis generation failed. Check your OPENAI_API_KEY." });
  }
});

/** DELETE /fights/:fightId/analysis — clear analysis cache so next GET re-runs with fresh data */
router.delete("/fights/:fightId/analysis", (req, res) => {
  const fightId = decodeURIComponent(req.params.fightId);
  try {
    const p = path.join(ANALYSIS_CACHE_DIR, `${fightId}.json`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      logger.info({ fightId }, "Analysis cache cleared via refresh request");
    }
    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err, fightId }, "Failed to clear analysis cache");
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

export default router;
