import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import fs from "node:fs";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────
export interface DeepAnalysis {
  fighter: string;
  confidence: "strong" | "lean" | "toss-up";
  reasoning: string;
  keyEdges: string[];
  riskFactors: string[];
  styleMatchup: string | null;
  commonOpponents: Array<{
    opponent: string;
    resultA: string;
    methodA: string;
    resultB: string;
    methodB: string;
    notes: string;
  }>;
  fighterAProfile: {
    name: string;
    style: string;
    strengths: string[];
    weaknesses: string[];
    recentForm: string[];
  };
  fighterBProfile: {
    name: string;
    style: string;
    strengths: string[];
    weaknesses: string[];
    recentForm: string[];
  };
}

// ── Disk cache (25-hour TTL) ──────────────────────────────────────────
const CACHE_DIR = "/tmp/ufc-analysis-cache";

function getCachePath(fightId: string): string {
  return path.join(CACHE_DIR, `${fightId}.json`);
}

export function readDiskCache(fightId: string): DeepAnalysis | null {
  try {
    const p = getCachePath(fightId);
    if (!fs.existsSync(p)) return null;
    const ageHours = (Date.now() - fs.statSync(p).mtimeMs) / 3_600_000;
    if (ageHours > 25) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as DeepAnalysis;
  } catch {
    return null;
  }
}

export function writeDiskCache(fightId: string, data: DeepAnalysis): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(getCachePath(fightId), JSON.stringify(data), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to write disk cache");
  }
}

export function clearDiskCache(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    for (const f of fs.readdirSync(CACHE_DIR)) fs.unlinkSync(path.join(CACHE_DIR, f));
    logger.info("Cleared analysis disk cache");
  } catch (err) {
    logger.warn({ err }, "Failed to clear disk cache");
  }
}

// ── In-flight dedup map ───────────────────────────────────────────────
const inFlight = new Map<string, Promise<DeepAnalysis>>();

// ── Prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an elite MMA analyst and fight scout with encyclopedic knowledge of every significant UFC, Bellator, ONE Championship, PFL, and regional MMA fighter — their styles, training camps, records, tendencies, and fight histories.

You reason like a head coach preparing a game plan: you study how each fighter imposes their game, where they get exposed, and what tape on common opponents reveals. You do NOT rely on betting odds to pick winners.

Respond ONLY with valid JSON matching the schema provided. No markdown, no code fences, no prose outside the JSON.`;

function buildPrompt(
  fighterA: string,
  fighterB: string,
  weightClass: string,
  oddsContext: string
): string {
  return `Analyze this MMA fight. Respond ONLY with valid JSON — no markdown, no code fences.

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}
${oddsContext}

Required JSON structure:
{
  "fighter": "<winner pick>",
  "confidence": "<strong|lean|toss-up>",
  "reasoning": "<3-5 paragraphs: stylistic thesis, how each fighter imposes their game, what decides the outcome. Name specific techniques and gameplans. 250+ words.>",
  "styleMatchup": "<1-2 paragraphs on the specific style clash and the X-factor that decides it.>",
  "keyEdges": ["<precise tactical/physical edge for your pick>", "<another>", "<another — min 3, max 6>"],
  "riskFactors": ["<concrete scenario where the pick loses — name the technique>", "<another — min 2, max 4>"],
  "commonOpponents": [
    {
      "opponent": "<shared opponent name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} won/lost, e.g. TKO R2>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} won/lost>",
      "notes": "<what the shared tape reveals — compare what was exposed>"
    }
  ],
  "fighterAProfile": {
    "name": "${fighterA}",
    "style": "<e.g. Orthodox Boxer | Muay Thai | BJJ Specialist | Greco-Roman Wrestler | Sambo | Karate | Kickboxer>",
    "strengths": ["<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W", "L", "W", "W", "L"]
  },
  "fighterBProfile": {
    "name": "${fighterB}",
    "style": "<primary style>",
    "strengths": ["<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W", "W", "W", "L", "W"]
  }
}

Rules:
- commonOpponents: up to 4 real shared opponents; empty array [] if none.
- recentForm: last 5 fights, most recent first, "W" or "L" only.
- confidence: "strong" = dominant stylistic edge; "lean" = moderate edge with real upset risk; "toss-up" = genuinely 50/50.
- Base pick on style, tape, records — NOT odds.
- If fighters are unknown regionals, give toss-up with honest "limited tape" context.`;
}

// ── Core analysis function ────────────────────────────────────────────
async function callAI(fight: OddsFight, weightClass: string): Promise<DeepAnalysis> {
  const oddsContext =
    fight.oddsA && fight.oddsB
      ? `Market odds (reference only — do NOT base your pick on these): ${fight.fighterA} ${decimalToAmerican(fight.oddsA)} / ${fight.fighterB} ${decimalToAmerican(fight.oddsB)}`
      : "";

  logger.info(
    { fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB },
    "Calling Replit AI for fight analysis"
  );

  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 2500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPrompt(fight.fighterA, fight.fighterB, weightClass || "MMA", oddsContext),
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  let parsed: DeepAnalysis;
  try {
    parsed = JSON.parse(raw) as DeepAnalysis;
  } catch {
    logger.error({ raw: raw.slice(0, 300) }, "AI response was not valid JSON — falling back");
    return oddsFallback(fight);
  }

  // Ensure fighter profile names are set
  if (parsed.fighterAProfile) parsed.fighterAProfile.name = fight.fighterA;
  if (parsed.fighterBProfile) parsed.fighterBProfile.name = fight.fighterB;

  writeDiskCache(fight.id, parsed);
  logger.info(
    { fightId: fight.id, pick: parsed.fighter, confidence: parsed.confidence },
    "AI analysis complete"
  );
  return parsed;
}

// ── Public export (with dedup + cache) ───────────────────────────────
export async function generateDeepAnalysis(
  fight: OddsFight,
  weightClass: string
): Promise<DeepAnalysis> {
  const cached = readDiskCache(fight.id);
  if (cached) {
    logger.info({ fightId: fight.id }, "Returning disk-cached analysis");
    return cached;
  }

  const existing = inFlight.get(fight.id);
  if (existing) {
    logger.info({ fightId: fight.id }, "Joining in-flight analysis request");
    return existing;
  }

  const promise = callAI(fight, weightClass).catch((err) => {
    logger.error({ err, fightId: fight.id }, "AI analysis failed — using odds fallback");
    return oddsFallback(fight);
  }).finally(() => {
    inFlight.delete(fight.id);
  });

  inFlight.set(fight.id, promise);
  return promise;
}

// ── Batch pre-generation (used by daily-refresh) ──────────────────────
export async function batchGenerateAnalyses(fights: OddsFight[]): Promise<void> {
  const needed = fights.filter((f) => !readDiskCache(f.id));
  if (needed.length === 0) {
    logger.info("All analyses already cached — nothing to pre-generate");
    return;
  }

  logger.info({ count: needed.length }, "Batch pre-generating fight analyses");

  await batchProcess(
    needed,
    async (fight) => {
      const result = await callAI(fight, "MMA");
      return result;
    },
    { concurrency: 1, retries: 3 }
  );

  logger.info("Batch analysis generation complete");
}

// ── Odds fallback ─────────────────────────────────────────────────────
function oddsFallback(fight: OddsFight): DeepAnalysis {
  const { fighterA, fighterB, oddsA, oddsB } = fight;

  if (!oddsA || !oddsB) {
    return {
      fighter: fighterA,
      confidence: "toss-up",
      reasoning: "Insufficient data to generate analysis for this fight.",
      keyEdges: [],
      riskFactors: ["No data available"],
      styleMatchup: null,
      commonOpponents: [],
      fighterAProfile: { name: fighterA, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
      fighterBProfile: { name: fighterB, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    };
  }

  const { probA, probB } = trueProbs(oddsA, oddsB);
  const americanA = decimalToAmerican(oddsA);
  const americanB = decimalToAmerican(oddsB);
  const favA = probA >= probB;
  const favorite = favA ? fighterA : fighterB;
  const underdog = favA ? fighterB : fighterA;
  const favProb = favA ? probA : probB;
  const favOdds = favA ? americanA : americanB;
  const dogOdds = favA ? americanB : americanA;
  const favPct = Math.round(favProb * 100);
  const confidence: "strong" | "lean" | "toss-up" =
    favProb >= 0.68 ? "strong" : favProb >= 0.57 ? "lean" : "toss-up";

  return {
    fighter: favorite,
    confidence,
    reasoning: `Market data: ${favorite} (${favOdds}) priced at ${favPct}% implied win probability vs ${underdog} (${dogOdds}).`,
    keyEdges: [
      `${favorite} ${favOdds} — ${favPct}% implied probability`,
      `${underdog} ${dogOdds} — ${100 - favPct}% implied probability`,
    ],
    riskFactors: ["MMA variance is high even for heavy favorites"],
    styleMatchup: null,
    commonOpponents: [],
    fighterAProfile: { name: fighterA, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    fighterBProfile: { name: fighterB, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
  };
}
