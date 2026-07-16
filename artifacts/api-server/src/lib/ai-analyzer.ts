import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import { getFighterData, formatSherdogContext } from "./sherdog.js";
import fs from "node:fs";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────
export interface DeepAnalysis {
  fighter: string;
  confidence: "strong" | "lean";
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
const SYSTEM_PROMPT = `You are an elite MMA analyst and fight scout with encyclopedic knowledge of every significant UFC, Bellator, ONE Championship, PFL, and regional MMA fighter.

You reason like a head coach preparing a game plan: you study styles, tendencies, training camps, how each fighter imposes their game, where they get exposed, and what tape on common opponents reveals. You do NOT use betting odds to form your pick — you use technique, tape, and record.

CRITICAL RULES:
1. You MUST always pick a winner. "toss-up" is not an option and will never be used. If a fight is close, pick the fighter with more proven tools for this specific matchup and use "lean".
2. Confidence is exactly one of: "strong" or "lean". Nothing else. Never "toss-up".
3. Use the verified Sherdog fight record data provided — treat it as ground truth for results, methods, and opponents.
4. Make your pick based on stylistic thesis, not on who the betting favorite is.

Respond ONLY with valid JSON. No markdown, no code fences, no prose outside the JSON.`;

function buildPrompt(
  fighterA: string,
  fighterB: string,
  weightClass: string,
  oddsContext: string,
  sherdogA: string | null,
  sherdogB: string | null
): string {
  const dataBlock = [
    "=== VERIFIED FIGHT RECORD DATA FROM SHERDOG ===",
    sherdogA
      ? `\n--- ${fighterA} ---\n${sherdogA}`
      : `\n--- ${fighterA} ---\nNo Sherdog data found — use your training knowledge.`,
    sherdogB
      ? `\n--- ${fighterB} ---\n${sherdogB}`
      : `\n--- ${fighterB} ---\nNo Sherdog data found — use your training knowledge.`,
    "=== END SHERDOG DATA ===",
  ].join("\n");

  return `Analyze this MMA fight using the verified data below. Respond ONLY with valid JSON.

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}
${oddsContext}

${dataBlock}

Required JSON structure:
{
  "fighter": "<winner pick — must be exactly '${fighterA}' or '${fighterB}'>",
  "confidence": "<strong or lean — NEVER toss-up. strong = clear stylistic edge; lean = real edge but genuine upset risk>",
  "reasoning": "<4-6 paragraphs: stylistic thesis, how each fighter imposes their game, what the Sherdog tape tells us about their finishing ability and chin, what decides the outcome. Reference specific opponents from the fight records above. 300+ words.>",
  "styleMatchup": "<2-3 paragraphs: the specific style friction, the range where this fight lives, and the X-factor that separates them. Mention specific techniques.>",
  "keyEdges": [
    "<precise tactical/physical edge for your pick — reference their actual record/methods>",
    "<another specific edge>",
    "<another — minimum 3, maximum 6>"
  ],
  "riskFactors": [
    "<concrete scenario where your pick loses — name the exact technique or pattern that beats them>",
    "<another risk — minimum 2, maximum 4>"
  ],
  "commonOpponents": [
    {
      "opponent": "<shared opponent name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} won/lost, e.g. TKO R2>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} won/lost>",
      "notes": "<what the shared tape reveals — compare HOW each fighter performed against this opponent, what was exposed>"
    }
  ],
  "fighterAProfile": {
    "name": "${fighterA}",
    "style": "<primary style tag, e.g. 'Orthodox Pressure Kickboxer | MMA Grappler'>",
    "strengths": ["<specific strength backed by their record>", "<another>", "<another>"],
    "weaknesses": ["<weakness exposed in their Sherdog losses>", "<another>"],
    "recentForm": ["W", "L", "W", "W", "L"]
  },
  "fighterBProfile": {
    "name": "${fighterB}",
    "style": "<primary style tag>",
    "strengths": ["<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W", "W", "W", "L", "W"]
  }
}

Rules:
- recentForm: last 5 fights from Sherdog data, most recent first, "W" or "L" only.
- commonOpponents: list up to 4 real shared opponents from the Sherdog records. Empty array [] only if genuinely no shared opponents.
- You MUST pick a winner. If it's genuinely close, pick the fighter with more proven finishing ability in this specific range and use "lean".
- Do NOT base your pick on the odds. Base it on technique, tape, and style matchup.`;
}

// ── Core analysis function ────────────────────────────────────────────
async function callAI(fight: OddsFight, weightClass: string): Promise<DeepAnalysis> {
  const oddsContext =
    fight.oddsA && fight.oddsB
      ? `Market odds (reference only — do NOT base your pick on these): ${fight.fighterA} ${decimalToAmerican(fight.oddsA)} / ${fight.fighterB} ${decimalToAmerican(fight.oddsB)}`
      : "";

  // Fetch Sherdog data for both fighters in parallel
  logger.info(
    { fighterA: fight.fighterA, fighterB: fight.fighterB },
    "Fetching Sherdog data for fight"
  );

  const [dataA, dataB] = await Promise.allSettled([
    getFighterData(fight.fighterA),
    getFighterData(fight.fighterB),
  ]);

  const sherdogA =
    dataA.status === "fulfilled" && dataA.value
      ? formatSherdogContext(dataA.value)
      : null;
  const sherdogB =
    dataB.status === "fulfilled" && dataB.value
      ? formatSherdogContext(dataB.value)
      : null;

  if (sherdogA) logger.info({ fighter: fight.fighterA }, "Sherdog data included in prompt");
  else logger.warn({ fighter: fight.fighterA }, "No Sherdog data — AI using training knowledge");
  if (sherdogB) logger.info({ fighter: fight.fighterB }, "Sherdog data included in prompt");
  else logger.warn({ fighter: fight.fighterB }, "No Sherdog data — AI using training knowledge");

  logger.info(
    { fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB },
    "Calling Replit AI for fight analysis"
  );

  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPrompt(
          fight.fighterA,
          fight.fighterB,
          weightClass || "MMA",
          oddsContext,
          sherdogA,
          sherdogB
        ),
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

  // Normalize confidence — never allow "toss-up" to slip through
  if (!["strong", "lean"].includes(parsed.confidence as string)) {
    parsed.confidence = "lean";
  }

  // Ensure fighter names are correctly set
  if (parsed.fighterAProfile) parsed.fighterAProfile.name = fight.fighterA;
  if (parsed.fighterBProfile) parsed.fighterBProfile.name = fight.fighterB;

  // Derive recentForm from Sherdog data if AI hallucinated
  if (dataA.status === "fulfilled" && dataA.value && parsed.fighterAProfile) {
    const form = dataA.value.recentFights
      .slice(0, 5)
      .map((f) => (f.result === "win" ? "W" : "L"));
    if (form.length > 0) parsed.fighterAProfile.recentForm = form;
  }
  if (dataB.status === "fulfilled" && dataB.value && parsed.fighterBProfile) {
    const form = dataB.value.recentFights
      .slice(0, 5)
      .map((f) => (f.result === "win" ? "W" : "L"));
    if (form.length > 0) parsed.fighterBProfile.recentForm = form;
  }

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

  const promise = callAI(fight, weightClass)
    .catch((err) => {
      logger.error({ err, fightId: fight.id }, "AI analysis failed — using odds fallback");
      return oddsFallback(fight);
    })
    .finally(() => {
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

// ── Odds fallback (when AI completely fails) ──────────────────────────
function oddsFallback(fight: OddsFight): DeepAnalysis {
  const { fighterA, fighterB, oddsA, oddsB } = fight;

  if (!oddsA || !oddsB) {
    return {
      fighter: fighterA,
      confidence: "lean",
      reasoning: "Insufficient data to generate a full analysis for this fight. Defaulting to Fighter A.",
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
  // Odds fallback always uses "lean" — no toss-up
  const confidence: "strong" | "lean" = favProb >= 0.68 ? "strong" : "lean";

  return {
    fighter: favorite,
    confidence,
    reasoning: `Market data: ${favorite} (${favOdds}) priced at ${favPct}% implied win probability vs ${underdog} (${dogOdds}). Full AI analysis unavailable — this pick is based on market consensus only.`,
    keyEdges: [
      `${favorite} ${favOdds} — ${favPct}% implied win probability`,
      `${underdog} ${dogOdds} — ${100 - favPct}% implied probability`,
    ],
    riskFactors: ["MMA variance is high even for heavy favorites"],
    styleMatchup: null,
    commonOpponents: [],
    fighterAProfile: { name: fighterA, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    fighterBProfile: { name: fighterB, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
  };
}
