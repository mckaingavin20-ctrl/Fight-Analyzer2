import OpenAI from "openai";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import fs from "node:fs";
import path from "node:path";

// ── Gemini via OpenAI-compatible endpoint ────────────────────────────
const openai = new OpenAI({
  apiKey: process.env["GOOGLE_AI_API_KEY"] ?? "missing",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
const MODEL = "gemini-2.0-flash";

// ── Global semaphore: only 1 Gemini call at a time ───────────────────
// Prevents rate-limit storms when multiple requests arrive concurrently.
let semaphoreQueue: Array<() => void> = [];
let semaphoreLocked = false;

async function acquireSemaphore(): Promise<void> {
  if (!semaphoreLocked) {
    semaphoreLocked = true;
    return;
  }
  return new Promise((resolve) => {
    semaphoreQueue.push(resolve);
  });
}

function releaseSemaphore(): void {
  const next = semaphoreQueue.shift();
  if (next) {
    next();
  } else {
    semaphoreLocked = false;
  }
}

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
    style: string;
    strengths: string[];
    weaknesses: string[];
    recentForm: string[];
  };
  fighterBProfile: {
    style: string;
    strengths: string[];
    weaknesses: string[];
    recentForm: string[];
  };
}

// ── Disk cache ────────────────────────────────────────────────────────
const CACHE_DIR = "/tmp/ufc-analysis-cache";

function getCachePath(fightId: string): string {
  return path.join(CACHE_DIR, `${fightId}.json`);
}

export function readDiskCache(fightId: string): DeepAnalysis | null {
  try {
    const p = getCachePath(fightId);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
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
    for (const f of fs.readdirSync(CACHE_DIR)) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
    logger.info("Cleared analysis disk cache");
  } catch (err) {
    logger.warn({ err }, "Failed to clear disk cache");
  }
}

// ── Prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an elite MMA analyst and fight scout with deep knowledge of every UFC, Bellator, ONE Championship, PFL, and major regional MMA fighter. You have encyclopedic knowledge of fighter styles, records, training camps, tendencies, and fight histories up to your knowledge cutoff.

Your job is to produce a detailed, honest, privately-researched fight breakdown — NOT based on betting odds. You reason like a head coach preparing a game plan: you study styles, how each fighter imposes their game, where they get exposed, and what the tape on common opponents reveals.

You must respond with ONLY valid JSON matching the schema provided. No markdown, no code fences, no prose outside the JSON.`;

function buildPrompt(fighterA: string, fighterB: string, weightClass: string, oddsContext: string): string {
  return `Analyze this MMA fight and respond ONLY with a JSON object (no markdown, no code fences):

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}
${oddsContext}

Return this exact JSON structure (all fields required):
{
  "fighter": "<name of who you pick to win>",
  "confidence": "<strong | lean | toss-up>",
  "reasoning": "<3-5 paragraph deep breakdown: stylistic thesis, how each fighter imposes their game, what determines the outcome. Name specific techniques, ranges, gameplans. Min 250 words.>",
  "styleMatchup": "<1-2 paragraphs on the specific style clash, e.g. pressure boxer vs reactive counter-striker, wrestler vs BJJ guard player. Describe the X-factor.>",
  "keyEdges": [
    "<specific tactical/physical edge for the pick — be precise>",
    "<another edge>",
    "<another edge — min 3, max 6>"
  ],
  "riskFactors": [
    "<concrete scenario where the pick loses — name the technique or situation>",
    "<another risk — min 2, max 4>"
  ],
  "commonOpponents": [
    {
      "opponent": "<shared opponent name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} won/lost, e.g. TKO R2, Sub R1, UD>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} won/lost>",
      "notes": "<what the shared tape reveals — be specific, compare styles and what was exposed>"
    }
  ],
  "fighterAProfile": {
    "style": "<primary style: Orthodox Boxer | Greco-Roman Wrestler | Muay Thai Striker | BJJ Specialist | Sambo | Karate | Kickboxer | Wrestling-Based MMA | etc>",
    "strengths": ["<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W or L", "W or L", "W or L", "W or L", "W or L"]
  },
  "fighterBProfile": {
    "style": "<primary style>",
    "strengths": ["<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W or L", "W or L", "W or L", "W or L", "W or L"]
  }
}

Rules:
- commonOpponents: up to 4 real shared opponents. Empty array [] if none exist.
- recentForm: last 5 fights, most recent first. "W" or "L" only.
- confidence: "strong" = dominant stylistic/physical edge; "lean" = moderate edge with real upset risk; "toss-up" = genuinely 50/50.
- DO NOT base pick on odds. Base it on style, tape, records, matchup logic.
- reasoning must be at least 250 words and analytically specific.
- If fighters are unknown regional athletes, give toss-up with honest "limited tape" reasoning.`;
}

// ── Main export ───────────────────────────────────────────────────────
export async function generateDeepAnalysis(
  fight: OddsFight,
  weightClass: string
): Promise<DeepAnalysis> {
  // Disk cache check (no semaphore needed for reads)
  const cached = readDiskCache(fight.id);
  if (cached) {
    logger.info({ fightId: fight.id }, "Returning disk-cached analysis");
    return cached;
  }

  const oddsContext = fight.oddsA && fight.oddsB
    ? `Odds (reference only — DO NOT base your pick on these): ${fight.fighterA} ${decimalToAmerican(fight.oddsA)} / ${fight.fighterB} ${decimalToAmerican(fight.oddsB)}`
    : "";

  // Acquire semaphore so only 1 Gemini call runs at a time
  await acquireSemaphore();

  // Re-check cache in case another request built it while we waited
  const cachedAfterWait = readDiskCache(fight.id);
  if (cachedAfterWait) {
    releaseSemaphore();
    return cachedAfterWait;
  }

  logger.info({ fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB }, "Calling Gemini");

  const MAX_RETRIES = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(fight.fighterA, fight.fighterB, weightClass || "MMA", oddsContext) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let parsed: DeepAnalysis;
      try {
        parsed = JSON.parse(raw) as DeepAnalysis;
      } catch {
        logger.error({ raw: raw.slice(0, 300) }, "Gemini response not valid JSON — using fallback");
        releaseSemaphore();
        return oddsFallback(fight);
      }

      writeDiskCache(fight.id, parsed);
      logger.info({ fightId: fight.id, pick: parsed.fighter, confidence: parsed.confidence }, "AI analysis complete");
      releaseSemaphore();
      return parsed;

    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number })?.status;

      if (status === 429) {
        // Exponential backoff: 6s, 12s, 24s, 48s
        const wait = 6000 * Math.pow(2, attempt - 1);
        logger.warn({ fightId: fight.id, attempt, waitMs: wait }, "Gemini rate limited — backing off");
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (status === 401 || status === 403) {
        logger.error("Gemini API key rejected — check GOOGLE_AI_API_KEY");
        releaseSemaphore();
        return oddsFallback(fight);
      }

      logger.error({ err, attempt }, "Gemini call failed");
      releaseSemaphore();
      return oddsFallback(fight);
    }
  }

  logger.error({ fightId: fight.id, lastErr }, "Max retries exceeded — using fallback");
  releaseSemaphore();
  return oddsFallback(fight);
}

// ── Odds fallback when AI is unavailable ──────────────────────────────
function oddsFallback(fight: OddsFight): DeepAnalysis {
  const { fighterA, fighterB, oddsA, oddsB } = fight;

  if (!oddsA || !oddsB) {
    return {
      fighter: fighterA,
      confidence: "toss-up",
      reasoning: "No odds data and AI analysis unavailable for this fight.",
      keyEdges: [],
      riskFactors: ["Insufficient data to make a confident pick"],
      styleMatchup: null,
      commonOpponents: [],
      fighterAProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
      fighterBProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
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
    reasoning: `Market fallback (AI analysis queued): ${favorite} (${favOdds}) is priced at ${favPct}% implied win probability vs ${underdog} (${dogOdds}).`,
    keyEdges: [
      `${favorite} ${favOdds} — ${favPct}% implied win probability`,
      `${underdog} ${dogOdds} — ${100 - favPct}% implied win probability`,
    ],
    riskFactors: ["MMA variance is high even for heavy favorites"],
    styleMatchup: null,
    commonOpponents: [],
    fighterAProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    fighterBProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
  };
}
