import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import { getFighterData, formatSherdogContext } from "./sherdog.js";
import { recordPick } from "./picks-tracker.js";
import fs from "node:fs";
import path from "node:path";

// ── Model config (item 1: configurable via env var) ───────────────────
const AI_MODEL = process.env["AI_MODEL"] ?? "gpt-5.6-terra";

// ── Types ─────────────────────────────────────────────────────────────
export interface DeepAnalysis {
  fighter: string;
  confidence: "strong" | "lean";
  reasoning: string;
  keyEdges: string[];
  riskFactors: string[];
  styleMatchup: string | null;
  upsetAnalysis: string | null;
  /** Whether real Sherdog record data was available for each fighter (item 3) */
  sherdogUsed: { fighterA: boolean; fighterB: boolean };
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

// ── Disk cache ────────────────────────────────────────────────────────
// Stored inside the project directory so it survives server restarts and
// redeployments. /tmp is wiped on every restart which caused picks to change.
const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/analysis"   // dist/../.cache → artifacts/api-server/.cache/analysis
);

function getCachePath(fightId: string): string {
  return path.join(CACHE_DIR, `${fightId}.json`);
}

export function readDiskCache(fightId: string): DeepAnalysis | null {
  try {
    const p = getCachePath(fightId);
    if (!fs.existsSync(p)) return null;
    const ageHours = (Date.now() - fs.statSync(p).mtimeMs) / 3_600_000;
    if (ageHours > 168) return null; // 7-day TTL — picks are locked until well after the fight
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

// ── System prompt ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an elite MMA analyst, fight scout, and professional handicapper who specializes in finding value on BOTH sides of a fight — including underdogs.

You have encyclopedic knowledge of UFC, Bellator, ONE Championship, PFL, and regional MMA. You reason like a betting analyst who has studied thousands of fights: you know that underdogs win roughly 35-40% of MMA fights, that styles make fights regardless of who is favored, and that the market is routinely wrong about fighters whose style is a nightmare for the favorite.

YOUR CORE ANALYTICAL RULES:
1. Never default to the favorite just because they are favored. The market reflects public perception, not necessarily style advantage.
2. Toss-up is not an option. Pick one fighter with either "strong" or "lean" confidence.
3. If the underdog's style genuinely exploits the favorite's known weaknesses, PICK THE UNDERDOG.
4. The favorite's loss record is your most important clue. If they've been beaten in the same way the underdog fights, that is a red flag.
5. Use the Sherdog fight records as ground truth for results and methods.

Respond ONLY with valid JSON. No markdown, no code fences, no prose outside the JSON.`;

// ── Prompt builder ─────────────────────────────────────────────────────
function buildPrompt(
  fighterA: string,
  fighterB: string,
  weightClass: string,
  favorite: string,
  underdog: string,
  favOdds: string,
  dogOdds: string,
  favImpliedPct: number,
  dogImpliedPct: number,
  sherdogA: string | null,
  sherdogB: string | null
): string {

  const dataBlock = [
    "=== VERIFIED FIGHT RECORD DATA (SHERDOG) ===",
    `\n--- ${fighterA} ---`,
    sherdogA ?? "No Sherdog data — use your training knowledge for this fighter.",
    `\n--- ${fighterB} ---`,
    sherdogB ?? "No Sherdog data — use your training knowledge for this fighter.",
    "=== END SHERDOG DATA ===",
  ].join("\n");

  const underdogResearch = `
=== MANDATORY UNDERDOG RESEARCH ===
Market says: ${favorite} is the FAVORITE (${favOdds}, ~${favImpliedPct}% implied win probability)
Market says: ${underdog} is the UNDERDOG (${dogOdds}, ~${dogImpliedPct}% implied win probability)

HISTORICAL MMA UPSET RATES (use as calibration):
- Underdogs priced at +100 to +150: win ~42% of fights
- Underdogs priced at +150 to +250: win ~34% of fights
- Underdogs priced at +250 to +400: win ~27% of fights
- Underdogs priced at +400 to +600: win ~19% of fights
- Underdogs priced at +600+: win ~12% of fights
- The market is NOT always right. Upsets happen constantly in MMA.

BEFORE YOU PICK, YOU MUST ANSWER THESE QUESTIONS IN YOUR ANALYSIS:

1. FAVORITE'S LOSS PATTERN: Look at ${favorite}'s Sherdog losses. What method/style beat them?
   Does ${underdog}'s style match that loss pattern? If yes — flag this as an UPSET ALERT.

2. UNDERDOG'S UPSET HISTORY: Has ${underdog} ever beaten someone of similar or higher caliber?
   Scan their Sherdog record for wins against ranked fighters, champions, or opponents who
   were heavy favorites. Successful underdogs have done it before.

3. UNDERDOG'S PATH TO VICTORY: Can ${underdog} realistically win? Describe the specific
   sequence: "If ${underdog} can establish X, then Y becomes available, which enables Z."
   Be concrete — name the range, the technique, the pattern.

4. STYLE-BASED UPSET POTENTIAL: Some style matchups produce upsets more than others:
   - Submission specialists vs. wrestlers (guard pullers catching wrestlers)
   - Orthodox pressure fighters vs. southpaw counterpunchers
   - High-volume strikers with poor takedown defense vs. elite grapplers
   - Fighters whose chin/gas tank has been exposed vs. high-output pressure fighters
   Identify which category this fight falls into.

5. FINAL DECISION: After this research — does the analysis support the favorite OR the
   underdog? Pick whoever the TAPE supports, regardless of the odds. If you still pick
   the favorite, explain specifically why the underdog's path to victory fails.
=== END UNDERDOG RESEARCH ===`;

  return `Analyze this MMA fight with deep underdog research. Respond ONLY with valid JSON.

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}

${underdogResearch}

${dataBlock}

Required JSON structure:
{
  "fighter": "<winner pick — must be exactly '${fighterA}' or '${fighterB}'>",
  "confidence": "<strong or lean — NEVER toss-up>",
  "reasoning": "<5-7 paragraphs. Cover: (1) stylistic thesis for your pick, (2) how each fighter imposes their game, (3) the favorite's loss pattern and whether it applies here, (4) the underdog's path to victory and why it succeeds or fails, (5) what the Sherdog tape reveals about finishing ability, chin, gas tank. Reference specific opponents from the records. 400+ words.>",
  "styleMatchup": "<2-3 paragraphs: the specific style friction, the range where this fight lives, and the X-factor that decides it. Name specific techniques and gameplans.>",
  "upsetAnalysis": "<3-4 sentences specifically about the underdog: Who is the underdog? What is their realistic path to winning? Does their style exploit the favorite's known loss patterns? Rate upset potential as LOW, MEDIUM, or HIGH and briefly explain why. This field must always be filled — even if you picked the favorite, explain the underdog threat level.>",
  "keyEdges": [
    "<precise tactical/physical edge for your pick — tied to their Sherdog record>",
    "<another specific edge>",
    "<another — minimum 3, maximum 6>"
  ],
  "riskFactors": [
    "<concrete scenario where your pick loses — name the exact technique or pattern>",
    "<another risk — minimum 2, maximum 4>"
  ],
  "commonOpponents": [
    {
      "opponent": "<shared opponent name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} won/lost, e.g. TKO R2>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} won/lost>",
      "notes": "<what the shared tape reveals — compare HOW each performed, what was exposed>"
    }
  ],
  "fighterAProfile": {
    "name": "${fighterA}",
    "style": "<primary style, e.g. 'Orthodox Pressure Kickboxer | MMA Grappler'>",
    "strengths": ["<specific strength backed by their Sherdog record>", "<another>", "<another>"],
    "weaknesses": ["<weakness visible in their losses or close fights>", "<another>"],
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
- recentForm: last 5 fights from Sherdog, most recent first, "W" or "L" only.
- commonOpponents: up to 4 real shared opponents from the Sherdog records. [] only if genuinely none.
- You MUST pick a winner. "toss-up" is never allowed.
- DO NOT default to the favorite. The underdog wins ~25-35% of fights. If their style fits, pick them.
- upsetAnalysis must always be filled with real content, not a placeholder.`;
}

// ── Core analysis function ────────────────────────────────────────────
async function callAI(fight: OddsFight, weightClass: string): Promise<DeepAnalysis> {
  // Determine favorite/underdog from odds
  let favorite = fight.fighterA;
  let underdog = fight.fighterB;
  let favDecimal = fight.oddsA;
  let dogDecimal = fight.oddsB;

  if (fight.oddsA && fight.oddsB && fight.oddsB < fight.oddsA) {
    // Lower decimal odds = more likely to win = favorite
    favorite = fight.fighterB;
    underdog = fight.fighterA;
    favDecimal = fight.oddsB;
    dogDecimal = fight.oddsA;
  }

  const favOdds = favDecimal ? decimalToAmerican(favDecimal) : "N/A";
  const dogOdds = dogDecimal ? decimalToAmerican(dogDecimal) : "N/A";

  let favImpliedPct = 50;
  let dogImpliedPct = 50;
  if (fight.oddsA && fight.oddsB) {
    const { probA, probB } = trueProbs(fight.oddsA, fight.oddsB);
    const favIsA = favorite === fight.fighterA;
    favImpliedPct = Math.round((favIsA ? probA : probB) * 100);
    dogImpliedPct = 100 - favImpliedPct;
  }

  // Fetch Sherdog data for both fighters in parallel
  logger.info(
    { fighterA: fight.fighterA, fighterB: fight.fighterB, favorite, underdog },
    "Fetching Sherdog data — favorite/underdog identified"
  );

  const [dataA, dataB] = await Promise.allSettled([
    getFighterData(fight.fighterA),
    getFighterData(fight.fighterB),
  ]);

  const sherdogA = dataA.status === "fulfilled" && dataA.value
    ? formatSherdogContext(dataA.value) : null;
  const sherdogB = dataB.status === "fulfilled" && dataB.value
    ? formatSherdogContext(dataB.value) : null;

  if (sherdogA) logger.info({ fighter: fight.fighterA }, "Sherdog data included");
  else logger.warn({ fighter: fight.fighterA }, "No Sherdog data — AI using training knowledge");
  if (sherdogB) logger.info({ fighter: fight.fighterB }, "Sherdog data included");
  else logger.warn({ fighter: fight.fighterB }, "No Sherdog data — AI using training knowledge");

  logger.info(
    { fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB },
    "Calling Replit AI for fight analysis"
  );

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: 3500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPrompt(
          fight.fighterA,
          fight.fighterB,
          weightClass || "MMA",
          favorite,
          underdog,
          favOdds,
          dogOdds,
          favImpliedPct,
          dogImpliedPct,
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

  // Hard-enforce: any confidence value that isn't "strong" becomes "lean" (item 5)
  if (parsed.confidence !== "strong") {
    parsed.confidence = "lean";
  }

  // Track whether real Sherdog data was used (item 3)
  parsed.sherdogUsed = {
    fighterA: sherdogA !== null,
    fighterB: sherdogB !== null,
  };

  // Ensure fighter names are correct
  if (parsed.fighterAProfile) parsed.fighterAProfile.name = fight.fighterA;
  if (parsed.fighterBProfile) parsed.fighterBProfile.name = fight.fighterB;

  // Override recentForm with ground-truth Sherdog data
  if (dataA.status === "fulfilled" && dataA.value && parsed.fighterAProfile) {
    const form = dataA.value.recentFights.slice(0, 5).map(f => f.result === "win" ? "W" : "L");
    if (form.length > 0) parsed.fighterAProfile.recentForm = form;
  }
  if (dataB.status === "fulfilled" && dataB.value && parsed.fighterBProfile) {
    const form = dataB.value.recentFights.slice(0, 5).map(f => f.result === "win" ? "W" : "L");
    if (form.length > 0) parsed.fighterBProfile.recentForm = form;
  }

  writeDiskCache(fight.id, parsed);

  // Record this pick in the tracker (no-op if already recorded)
  recordPick(
    fight.id,
    fight.fighterA,
    fight.fighterB,
    fight.commenceTime,
    parsed.fighter,
    parsed.confidence
  );

  logger.info(
    {
      fightId: fight.id,
      pick: parsed.fighter,
      confidence: parsed.confidence,
      pickedUnderdog: parsed.fighter === underdog,
    },
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
  const needed = fights.filter(f => !readDiskCache(f.id));
  if (needed.length === 0) {
    logger.info("All analyses already cached — nothing to pre-generate");
    return;
  }
  logger.info({ count: needed.length }, "Batch pre-generating fight analyses");
  await batchProcess(
    needed,
    async (fight) => callAI(fight, "MMA"),
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
      reasoning: "Insufficient data to generate a full analysis.",
      keyEdges: [],
      riskFactors: ["No data available"],
      styleMatchup: null,
      upsetAnalysis: null,
      sherdogUsed: { fighterA: false, fighterB: false },
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
    upsetAnalysis: `${underdog} is the underdog at ${dogOdds} (~${100 - favPct}% implied). Full style analysis unavailable — manual research recommended before fading the market.`,
    sherdogUsed: { fighterA: false, fighterB: false },
    commonOpponents: [],
    fighterAProfile: { name: fighterA, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
    fighterBProfile: { name: fighterB, style: "Fighter", strengths: [], weaknesses: [], recentForm: [] },
  };
}
