import OpenAI from "openai";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import fs from "node:fs";
import path from "node:path";

// If the API key is quota-exhausted, stop retrying for this process lifetime
let quotaExhausted = false;

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

export interface DeepAnalysis {
  fighter: string;
  confidence: "strong" | "lean" | "toss-up";
  reasoning: string;
  keyEdges: string[];
  riskFactors: string[];
  styleMatchup: string;
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

const CACHE_DIR = "/tmp/ufc-analysis-cache";

function getCachePath(fightId: string): string {
  return path.join(CACHE_DIR, `${fightId}.json`);
}

function readDiskCache(fightId: string): DeepAnalysis | null {
  try {
    const p = getCachePath(fightId);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    if (ageHours > 25) return null; // stale after 25h (daily refresh window)
    return JSON.parse(fs.readFileSync(p, "utf8")) as DeepAnalysis;
  } catch {
    return null;
  }
}

function writeDiskCache(fightId: string, data: DeepAnalysis): void {
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
    logger.info("Cleared analysis disk cache for daily refresh");
  } catch (err) {
    logger.warn({ err }, "Failed to clear disk cache");
  }
}

const SYSTEM_PROMPT = `You are an elite MMA analyst and fight scout with deep knowledge of every UFC, Bellator, ONE Championship, PFL, and major regional MMA fighter. You have encyclopedic knowledge of fighter styles, records, training camps, tendencies, and fight histories up to your knowledge cutoff.

Your job is to produce a detailed, honest, privately-researched fight breakdown — NOT based on betting odds. You reason like a head coach preparing a game plan: you study styles, how each fighter imposes their game, where they get exposed, and what the tape on common opponents reveals.

You must respond with ONLY valid JSON matching the schema provided. No markdown, no prose outside the JSON.`;

function buildPrompt(fighterA: string, fighterB: string, weightClass: string, oddsContext: string): string {
  return `Analyze this MMA fight and respond ONLY with a JSON object matching this exact schema:

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}
${oddsContext}

Return this exact JSON structure (all fields required):
{
  "fighter": "<name of who you pick to win>",
  "confidence": "<one of: strong | lean | toss-up>",
  "reasoning": "<3-5 paragraph detailed breakdown covering: overall stylistic thesis, how each fighter imposes their game, what the tape shows about their tendencies, what determines the outcome. Be specific — name techniques, ranges, gameplans. Minimum 250 words.>",
  "styleMatchup": "<1-2 paragraphs on the specific style clash: e.g. how a pressure boxer deals with a reactive counter-striker, or how a wrestler handles a BJJ guard player. Describe the X-factor that decides the fight.>",
  "keyEdges": [
    "<specific tactical or physical edge for the pick — be precise, not generic>",
    "<another edge>",
    "<another edge — minimum 3, maximum 6>"
  ],
  "riskFactors": [
    "<concrete scenario where the pick loses — name the technique or situation>",
    "<another risk>",
    "<minimum 2, maximum 4>"
  ],
  "commonOpponents": [
    {
      "opponent": "<fighter name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} beat or lost to them: e.g. TKO R2, Sub R1, UD, etc>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} beat or lost to them>",
      "notes": "<what the shared opponent tape reveals about each fighter's tendencies — e.g. 'Both exposed X's chin on the right hand, but A got there in 90 seconds while B needed 3 rounds'>  "
    }
  ],
  "fighterAProfile": {
    "style": "<primary combat style: e.g. Orthodox Boxer, Greco-Roman Wrestler, Muay Thai Striker, Jiu-Jitsu Specialist, Sambo, Karate, Kickboxer, Wrestling-Based MMA, etc.>",
    "strengths": ["<specific strength>", "<specific strength>", "<specific strength>"],
    "weaknesses": ["<specific weakness>", "<specific weakness>"],
    "recentForm": ["<W/L>", "<W/L>", "<W/L>", "<W/L>", "<W/L>"]
  },
  "fighterBProfile": {
    "style": "<primary combat style>",
    "strengths": ["<specific strength>", "<specific strength>", "<specific strength>"],
    "weaknesses": ["<specific weakness>", "<specific weakness>"],
    "recentForm": ["<W/L>", "<W/L>", "<W/L>", "<W/L>", "<W/L>"]
  }
}

Rules:
- If you cannot identify one or both fighters (unknown regional fighters), still fill all fields with "Unknown fighter" context and give a toss-up pick.
- commonOpponents: list up to 4 real shared opponents from their fight histories. If none exist, return an empty array [].
- recentForm: last 5 fights, most recent first. Use "W" or "L" only.
- confidence: "strong" = clear stylistic/physical dominant edge; "lean" = moderate edge with real upset risk; "toss-up" = genuinely 50/50 stylistically.
- DO NOT base the pick on betting odds. Base it purely on style, tape, records, and matchup logic.
- reasoning must be analytical, specific, and at least 250 words.`;
}

export async function generateDeepAnalysis(
  fight: OddsFight,
  weightClass: string
): Promise<DeepAnalysis> {
  // Check disk cache first
  const cached = readDiskCache(fight.id);
  if (cached) {
    logger.info({ fightId: fight.id }, "Returning cached deep analysis");
    return cached;
  }

  const oddsContext = fight.oddsA && fight.oddsB
    ? `Odds (for reference only, do NOT base your pick on these): ${fight.fighterA} ${decimalToAmerican(fight.oddsA)} / ${fight.fighterB} ${decimalToAmerican(fight.oddsB)}`
    : "";

  // Infer weight class from fighter names if not provided
  const wc = weightClass || "MMA";

  if (quotaExhausted) {
    logger.warn({ fightId: fight.id }, "OpenAI quota exhausted — returning odds fallback");
    return oddsFallback(fight);
  }

  logger.info({ fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB }, "Generating deep AI analysis");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(fight.fighterA, fight.fighterB, wc, oddsContext) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: DeepAnalysis;

    try {
      parsed = JSON.parse(raw) as DeepAnalysis;
    } catch (err) {
      logger.error({ err, raw }, "Failed to parse AI response");
      return oddsFallback(fight);
    }

    writeDiskCache(fight.id, parsed);
    return parsed;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const status = (err as { status?: number })?.status;
    if (status === 429 || code === "insufficient_quota") {
      quotaExhausted = true;
      logger.error("OpenAI quota exhausted — falling back to odds-based analysis for all fights");
    } else {
      logger.error({ err }, "OpenAI call failed");
    }
    return oddsFallback(fight);
  }
}

/** Odds-based fallback when OpenAI is unavailable */
function oddsFallback(fight: OddsFight): DeepAnalysis {
  const { fighterA, fighterB, oddsA, oddsB } = fight;

  if (!oddsA || !oddsB) {
    return {
      fighter: fighterA,
      confidence: "toss-up",
      reasoning: "No odds data and AI analysis unavailable. Add OpenAI API credits at platform.openai.com to enable deep scouting.",
      keyEdges: [],
      riskFactors: ["No data available"],
      styleMatchup: null,
      commonOpponents: [],
      fighterAProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
      fighterBProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    };
  }

  const { probA, probB } = trueProbs(oddsA, oddsB);
  const americanA = decimalToAmerican(oddsA);
  const americanB = decimalToAmerican(oddsB);
  const favorite = probA >= probB ? fighterA : fighterB;
  const underdog = probA >= probB ? fighterB : fighterA;
  const favProb = probA >= probB ? probA : probB;
  const favOdds = probA >= probB ? americanA : americanB;
  const dogOdds = probA >= probB ? americanB : americanA;
  const favPct = Math.round(favProb * 100);
  const confidence: "strong" | "lean" | "toss-up" =
    favProb >= 0.68 ? "strong" : favProb >= 0.57 ? "lean" : "toss-up";

  return {
    fighter: favorite,
    confidence,
    reasoning: `⚠️ Deep AI analysis unavailable — your OpenAI API key is over quota. To get full style-vs-style breakdowns, add credits at platform.openai.com/settings/billing.\n\nMarket fallback: ${favorite} (${favOdds}) is priced at ${favPct}% implied probability vs ${underdog} (${dogOdds}). The book line suggests a ${confidence === "strong" ? "clear" : confidence === "lean" ? "moderate" : "coin-flip"} edge.`,
    keyEdges: [`${favorite} ${favOdds} (${favPct}% implied win probability)`, `Opponent ${underdog} at ${dogOdds} (${100 - favPct}%)`],
    riskFactors: ["AI analysis unavailable — add OpenAI credits for full breakdown", "MMA variance is high even for heavy favorites"],
    styleMatchup: null,
    commonOpponents: [],
    fighterAProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    fighterBProfile: { style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
  };
}
