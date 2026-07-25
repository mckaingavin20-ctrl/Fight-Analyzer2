import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { logger } from "./logger.js";
import type { OddsFight } from "./odds.js";
import { decimalToAmerican, trueProbs } from "./odds.js";
import type { SherdogFighterData } from "./sherdog.js";
import { getFighterData, formatSherdogContext } from "./sherdog.js";
import type { UfcStatsFighterStats } from "./ufcstats.js";
import { getFighterStats, formatUfcStatsContext } from "./ufcstats.js";
import { getUfcRankings, lookupRanking, formatRankingContext } from "./ufc-rankings.js";
import { getTapologyData, formatTapologyContext } from "./tapology.js";
import { getMmaDecisionsData, formatMmaDecisionsContext } from "./mma-decisions.js";
import { getBfoData, formatBfoContext } from "./bestfightodds.js";
import { getFightMatrixData, formatFightMatrixContext } from "./fightmatrix.js";
import { getEspnFighterDetail, formatEspnFighterContext } from "./espn-fighter.js";
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
    radarMetrics?: {
      striking: number; grappling: number; cardio: number;
      chin: number; power: number; defense: number;
    };
  };
  fighterBProfile: {
    name: string;
    style: string;
    strengths: string[];
    weaknesses: string[];
    recentForm: string[];
    radarMetrics?: {
      striking: number; grappling: number; cardio: number;
      chin: number; power: number; defense: number;
    };
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
    if (ageHours > 48) return null; // 48h TTL — re-run with fresh fighter data every 2 days
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
const SYSTEM_PROMPT = `You are an elite MMA analyst, fight scout, and professional handicapper. Your predictions are used for real money betting. ACCURACY is your only goal.

Pick the fighter most likely to win based on evidence: statistics, fight tape, physical attributes, and stylistic matchups. You are not trying to be contrarian, find value, or pick upsets for their own sake. You are trying to be correct.

═══ CORE PRINCIPLES ═══
1. FAVORITES ARE FAVORITES FOR A REASON. Betting markets are efficient. Heavy favorites (-250 or worse) are usually correct — their advantages are real. Do not fade a heavy favorite without clear, specific evidence from the tape.
2. Pick whoever the data supports — favorite or underdog. If the favorite has real, documented advantages and the underdog has no specific counter in their skill set, PICK THE FAVORITE with confidence.
3. Pick an underdog ONLY when their specific primary skill set matches the favorite's documented loss pattern AND the underdog has beaten fighters of comparable or higher caliber. This is rare, not the default.
4. "Strong" confidence = clear advantages on multiple dimensions with no credible counter. "Lean" = meaningful edge in key areas but the opponent has real paths to winning.
5. Never pick toss-up. Every fight has a better pick — find it based on the evidence.

═══ CALIBRATION: WHEN TO PICK UNDERDOGS ═══
The market is usually right. Pick an underdog ONLY when ALL THREE of these are true:
A) The underdog's PRIMARY winning method (striking/grappling/submission) directly matches HOW the favorite has lost before (same method, same type of opponent)
B) The underdog has demonstrated wins at comparable or higher levels of competition
C) The physical and statistical matchup supports the upset path (reach, stats, recent form)
If you cannot clearly satisfy all three criteria, pick the favorite.

═══ HOW TO READ THE STATS ═══
SLpM (strikes landed/min): offensive output. UFC elite avg ≈ 3.5. High = volume striker.
Str.Acc %: precision. <44% = wild; >55% = surgical.
SApM (strikes absorbed/min): durability concern. High + low StrDef = defensive liability.
Str.Def %: how often they dodge/block. >62% = elite; <50% = can be touched.
Net Strike Diff = SLpM − SApM: POSITIVE means they land more than they eat. Key predictor of striking dominance.
TD Avg/15min: grappling output. >3.0 = heavy wrestler.
TD Def %: >82% = elite; <65% = exploitable by any wrestler.
Sub Avg/15min: >1.0 = constant submission threat on the mat.
Finish Rate %: what % of wins come by finish (KO+Sub). >70% = dangerous finisher; <40% = likely going to decision.
Loss Method breakdown: HOW they lose is more predictive than their record. Repeated KO losses = chin; repeated Sub losses = weak ground defense.

═══ PHYSICAL MATCHUP FACTORS ═══
Reach advantage: every inch of reach is meaningful at range. >3" is a significant striking range edge.
Stance matchup: Orthodox vs Southpaw creates power-shot angles that favor the southpaw's lead left hand and right overhand. Flag this explicitly.
Age gap: fighters 32+ show measurable decline in reaction time, chin, and cardio. A 6+ year age gap favors the younger fighter in competitive matchups.
Layoff rust: fighters returning from 12+ month layoffs underperform in the first 2 rounds before settling in. Flag long layoffs explicitly. If BOTH fighters are coming off long layoffs, the one with the longer layoff has MORE rust risk.

═══ FIGHT STRUCTURE FACTORS ═══
3-round fights: early finishes are most common in rounds 1-2. Cardio matters less; first-round momentum is critical.
5-round fights (main events / title fights): cardio, championship rounds (4-5), and the ability to adapt mid-fight are decisive. A slower starter with elite cardio often beats an explosive opener. Finishing ability in late rounds is a major edge.
Home country / crowd effects: fighters in their home country show measurable performance uplift, especially in close fights.

═══ MOMENTUM & FORM ═══
A fighter on a 3+ fight WIN streak at elite level has current momentum — their game is sharp and evolving.
A fighter on a LOSING streak may have identified, exploitable weaknesses that opponents are now consistently game-planning around. This is a real signal, not noise.
A comeback fighter returning after a long layoff on a win streak may still carry ring rust in a step-up fight.
Recent form (last 3 fights) outweighs career stats for fighters who have clearly evolved or declined.

═══ BETTING LINE MOVEMENT (BestFightOdds) ═══
The opening line reflects the book's initial assessment. The closing line reflects where sharp/professional money landed.
- Fighter's line SHORTENING (e.g. +200 → +120): sharp money backs them. This is a meaningful secondary signal.
- Fighter's line LENGTHENING (e.g. -300 → -180): sharp money fading them, or news of injury/weight issue leaked.
- Large line moves (>60 points American) on a fighter = strong sharp consensus. Weight it.
- If a fighter is consistently a CLOSING LINE underdog who beats their closing line (wins or covers), that's a real market edge signal.

═══ ALGORITHMIC RATINGS (FightMatrix Elo) ═══
FightMatrix Elo reflects cumulative performance vs. rated competition. Higher = consistently beat better opponents.
- A >150 point Elo gap is a significant algorithmic edge; >300 points is dominant.
- Elo is most reliable for veterans with 10+ rated fights. Treat it as a tie-breaker, not a primary signal.
- A lower-ranked fighter beating a much higher Elo opponent IS the upset — it's rare and noteworthy.

═══ CAMP & COACHING QUALITY (Tapology) ═══
Elite camps create systematic advantages in specific areas. Flag mismatches:
- Top wrestling/MMA camps (AKA, Sanford MMA, Elevation, Serra-Longo): systematic TD improvement, elite defense drilling
- Top striking camps (City Kickboxing, Tristar, Saenchai gym): technical striking evolution over career
- A fighter who recently moved to an elite camp (1-2 years ago) may show improvement not yet reflected in career averages
- A solo-trained or small-gym fighter facing an elite-camp fighter in a grappling-intensive matchup is a real disadvantage signal

═══ WEIGHT CLASS KO VARIANCE ═══
Heavyweight / Light Heavyweight: single-punch KO is ALWAYS live regardless of odds. Even -500 favorites can be one-punched. Temper "strong" confidence for pure striker favorites in these divisions; every fighter has a puncher's chance.
Middleweight and below: fights more often decided by volume, grappling, and technical precision. Pure KO fluke is less common below 205 lbs.

═══ STATISTICAL PREDICTORS (ranked by importance) ═══
1. Strike differential (net SLpM) — best single predictor of fight outcome
2. Takedown defense when combined with the opponent's TD offense
3. Finish method match: underdog's win method matches favorite's loss method → upset alert
4. Significant physical advantage (reach >4", age gap >6 years)
5. Recency, layoff, and current form (fresh vs rusty, hot streak vs cold)
6. Line movement — where did sharp money land?
7. Common opponents — how did each perform vs shared competition?

Respond ONLY with valid JSON. No markdown, no code fences, no prose outside the JSON.`;

// ── Helper: parse Sherdog date string ─────────────────────────────────
function parseSherdogDateStr(dateStr: string): Date | null {
  try {
    const d = new Date(dateStr.replace(/\./g, ""));
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// ── Helper: compute current win/loss streak from recentFights ─────────
function computeStreak(fights: SherdogFighterData["recentFights"]): string {
  const active = fights.filter(f => f.result === "win" || f.result === "loss");
  if (!active.length) return "unknown";
  const first = active[0].result;
  let count = 0;
  for (const f of active) {
    if (f.result !== first) break;
    count++;
  }
  return `${count}-fight ${first === "win" ? "WIN STREAK 🔥" : "LOSING STREAK ⚠"}`;
}

// ── Helper: pre-compute real common opponents from Sherdog records ─────
function findCommonOpponents(
  fighterA: string,
  fighterB: string,
  sherdogA: SherdogFighterData | null,
  sherdogB: SherdogFighterData | null,
): string {
  if (!sherdogA?.recentFights.length || !sherdogB?.recentFights.length) return "";
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const mapA = new Map<string, SherdogFighterData["recentFights"][0]>();
  for (const f of sherdogA.recentFights) mapA.set(norm(f.opponent), f);

  const shared: Array<{ opp: string; fA: SherdogFighterData["recentFights"][0]; fB: SherdogFighterData["recentFights"][0] }> = [];
  for (const fB of sherdogB.recentFights) {
    const key = norm(fB.opponent);
    // Avoid matching the fighters against each other as an "opponent"
    if (key === norm(fighterA) || key === norm(fighterB)) continue;
    const fA = mapA.get(key);
    if (fA) shared.push({ opp: fB.opponent, fA, fB });
  }
  if (!shared.length) return "";

  const lines = ["=== PRE-COMPUTED COMMON OPPONENTS (real tape from Sherdog) ===",
    "These are verified shared opponents — use them as the primary basis for commonOpponents in your response.",
    "Compare HOW each fighter won/lost (round, method, damage taken), not just the result."];
  for (const { opp, fA, fB } of shared.slice(0, 4)) {
    const rA = `${fA.result.toUpperCase()} (${fA.method}${fA.round ? ` R${fA.round}` : ""}, ${fA.date})`;
    const rB = `${fB.result.toUpperCase()} (${fB.method}${fB.round ? ` R${fB.round}` : ""}, ${fB.date})`;
    lines.push(`  vs ${opp}: ${fighterA} → ${rA} | ${fighterB} → ${rB}`);
  }
  lines.push("=== END COMMON OPPONENTS ===");
  return lines.join("\n");
}

// ── Computed matchup metrics ───────────────────────────────────────────
function computeMatchupMetrics(
  fighterA: string,
  fighterB: string,
  sherdogA: SherdogFighterData | null,
  sherdogB: SherdogFighterData | null,
  statsA: UfcStatsFighterStats | null,
  statsB: UfcStatsFighterStats | null,
  isMainEvent: boolean
): string {
  const lines: string[] = ["=== COMPUTED MATCHUP METRICS (pre-calculated for you) ==="];

  // ── Reach comparison ──────────────────────────────────────────────────
  const parseReachIn = (r: string | null | undefined): number | null => {
    if (!r) return null;
    const m = r.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  };
  const reachA = parseReachIn(statsA?.reach);
  const reachB = parseReachIn(statsB?.reach);
  if (reachA !== null && reachB !== null) {
    const diff = reachA - reachB;
    const who = diff > 0 ? fighterA : fighterB;
    const mag = Math.abs(diff);
    const note = mag >= 4 ? "SIGNIFICANT reach edge" : mag >= 2 ? "meaningful reach edge" : "slight reach edge";
    lines.push(`Reach: ${fighterA} ${reachA}" vs ${fighterB} ${reachB}" → ${who} +${mag}" (${note})`);
  }

  // ── Age / career stage ────────────────────────────────────────────────
  if (statsA?.age !== null && statsB?.age !== null && statsA?.age !== undefined && statsB?.age !== undefined) {
    const diff = Math.abs(statsA.age - statsB.age);
    const older = statsA.age > statsB.age ? fighterA : fighterB;
    const younger = statsA.age > statsB.age ? fighterB : fighterA;
    const note = statsA.age >= 36 || statsB.age >= 36
      ? `${older} (${Math.max(statsA.age, statsB.age)}) is in potential decline range (36+)`
      : diff >= 6 ? `${diff}-year gap — ${younger} has meaningful youth/recovery edge`
      : diff >= 3 ? `${diff}-year gap — minor youth edge to ${younger}`
      : "ages similar";
    lines.push(`Age: ${fighterA} ${statsA.age} vs ${fighterB} ${statsB.age} → ${note}`);
  }

  // ── Stance matchup ────────────────────────────────────────────────────
  const stanceA = statsA?.stance?.toLowerCase() ?? "";
  const stanceB = statsB?.stance?.toLowerCase() ?? "";
  if (stanceA && stanceB) {
    const aOrtho = stanceA.includes("orthodox");
    const bOrtho = stanceB.includes("orthodox");
    const aSouth = stanceA.includes("southpaw");
    const bSouth = stanceB.includes("southpaw");
    if ((aOrtho && bSouth) || (aSouth && bOrtho)) {
      const southpaw = aSouth ? fighterA : fighterB;
      lines.push(`Stance: ORTHODOX vs SOUTHPAW — ${southpaw} has southpaw angle advantage (power right hand from outside, leads create angle conflicts). Statistically ~6% higher win rate for southpaws in UFC.`);
    } else {
      lines.push(`Stance: ${statsA.stance ?? "?"} vs ${statsB.stance ?? "?"} — mirror stance, no angle edge`);
    }
  }

  // ── Net strike differential ───────────────────────────────────────────
  if (statsA?.slpm !== null && statsA?.sapm !== null && statsB?.slpm !== null && statsB?.sapm !== null &&
      statsA?.slpm !== undefined && statsA?.sapm !== undefined && statsB?.slpm !== undefined && statsB?.sapm !== undefined) {
    const netA = +(statsA.slpm - statsA.sapm).toFixed(2);
    const netB = +(statsB.slpm - statsB.sapm).toFixed(2);
    const edgeWho = netA > netB ? fighterA : fighterB;
    const edgeMag = Math.abs(netA - netB).toFixed(2);
    lines.push(`Net strike diff: ${fighterA} ${netA > 0 ? "+" : ""}${netA} vs ${fighterB} ${netB > 0 ? "+" : ""}${netB} → ${edgeWho} wins striking exchange on paper (+${edgeMag} net edge) — strongest predictor of fight outcome`);
  }

  // ── TD efficiency vs opponent TD defense ──────────────────────────────
  if (statsA?.tdAvg !== null && statsA?.tdAcc !== null && statsB?.tdDef !== null &&
      statsA?.tdAvg !== undefined && statsA?.tdAcc !== undefined && statsB?.tdDef !== undefined) {
    const effA = +(statsA.tdAvg * (statsA.tdAcc / 100)).toFixed(2);
    const stopRate = statsB.tdDef;
    const actualA = +(effA * (1 - stopRate / 100)).toFixed(2);
    lines.push(`${fighterA} TD efficiency: ${effA} actual TDs/15min attempted → vs ${fighterB}'s ${stopRate}% TD def = ~${actualA} TDs likely to land per 15min`);
  }
  if (statsB?.tdAvg !== null && statsB?.tdAcc !== null && statsA?.tdDef !== null &&
      statsB?.tdAvg !== undefined && statsB?.tdAcc !== undefined && statsA?.tdDef !== undefined) {
    const effB = +(statsB.tdAvg * (statsB.tdAcc / 100)).toFixed(2);
    const stopRate = statsA.tdDef;
    const actualB = +(effB * (1 - stopRate / 100)).toFixed(2);
    lines.push(`${fighterB} TD efficiency: ${effB} actual TDs/15min attempted → vs ${fighterA}'s ${stopRate}% TD def = ~${actualB} TDs likely to land per 15min`);
  }

  // ── Finish / loss pattern flags ───────────────────────────────────────
  if (sherdogA) {
    const losses = sherdogA.recentFights.filter(f => f.result === "loss");
    const koLosses = losses.filter(f => /ko|tko|knock/i.test(f.method)).length;
    const subLosses = losses.filter(f => /sub|choke|lock|bar/i.test(f.method)).length;
    if (koLosses >= 2) lines.push(`⚠ ${fighterA} KO/TKO vulnerability: ${koLosses} recent losses by striking stoppage — chin concern`);
    if (subLosses >= 2) lines.push(`⚠ ${fighterA} submission vulnerability: ${subLosses} recent submission losses — ground game exposure`);
  }
  if (sherdogB) {
    const losses = sherdogB.recentFights.filter(f => f.result === "loss");
    const koLosses = losses.filter(f => /ko|tko|knock/i.test(f.method)).length;
    const subLosses = losses.filter(f => /sub|choke|lock|bar/i.test(f.method)).length;
    if (koLosses >= 2) lines.push(`⚠ ${fighterB} KO/TKO vulnerability: ${koLosses} recent losses by striking stoppage — chin concern`);
    if (subLosses >= 2) lines.push(`⚠ ${fighterB} submission vulnerability: ${subLosses} recent submission losses — ground game exposure`);
  }

  // ── Fight structure ───────────────────────────────────────────────────
  lines.push(`Scheduled: ${isMainEvent ? "5 ROUNDS (championship/main event) — cardio, adjustments, and championship rounds 4-5 are decisive" : "3 ROUNDS — early momentum and finish rate matter more than cardio"}`);

  // ── Win/loss streak and momentum ─────────────────────────────────────
  if (sherdogA?.recentFights.length) {
    lines.push(`${fighterA} current streak: ${computeStreak(sherdogA.recentFights)}`);
  }
  if (sherdogB?.recentFights.length) {
    lines.push(`${fighterB} current streak: ${computeStreak(sherdogB.recentFights)}`);
  }

  // ── Layoff comparison ─────────────────────────────────────────────────
  const daysSince = (sherdog: SherdogFighterData | null): number | null => {
    if (!sherdog?.recentFights[0]?.date) return null;
    const d = parseSherdogDateStr(sherdog.recentFights[0].date);
    return d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null;
  };
  const daysA = daysSince(sherdogA);
  const daysB = daysSince(sherdogB);
  if (daysA !== null && daysB !== null) {
    const rustLabel = (d: number) =>
      d <= 90  ? "fresh (<90d)"
      : d <= 180 ? "normal (90-180d)"
      : d <= 365 ? "moderate layoff (180-365d) — some ring rust likely"
      : `LONG LAYOFF (${d}d) ⚠ — significant ring rust risk in rounds 1-2`;
    lines.push(`Layoff comparison: ${fighterA} ${daysA}d since last fight [${rustLabel(daysA)}] | ${fighterB} ${daysB}d [${rustLabel(daysB)}]`);
    if (daysA > 365 && daysB > 365) {
      lines.push(`⚠ BOTH fighters have 12+ month layoffs — the fighter with more layoff (${daysA > daysB ? fighterA : fighterB}) carries greater rust risk`);
    }
  }

  lines.push("=== END COMPUTED METRICS ===");
  return lines.join("\n");
}

// ── Prompt builder ─────────────────────────────────────────────────────
interface ExtraSources {
  rankA: string | null; rankB: string | null;
  tapCtxA: string | null; tapCtxB: string | null;
  decCtxA: string | null; decCtxB: string | null;
  espnCtxA: string | null; espnCtxB: string | null;
  bfoCtxA: string | null; bfoCtxB: string | null;
  fmCtxA: string | null; fmCtxB: string | null;
}

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
  sherdogB: string | null,
  ufcStatsA: string | null,
  ufcStatsB: string | null,
  metricsBlock: string,
  commonOpponentsBlock: string,
  isMainEvent: boolean,
  extra: ExtraSources = {
    rankA: null, rankB: null,
    tapCtxA: null, tapCtxB: null,
    decCtxA: null, decCtxB: null,
    espnCtxA: null, espnCtxB: null,
    bfoCtxA: null, bfoCtxB: null,
    fmCtxA: null, fmCtxB: null,
  }
): string {

  // UFC Rankings block
  const rankingLines: string[] = [];
  if (extra.rankA) rankingLines.push(extra.rankA);
  if (extra.rankB) rankingLines.push(extra.rankB);
  const rankingBlock = rankingLines.length
    ? `\n=== UFC OFFICIAL RANKINGS ===\n${rankingLines.join("\n")}\n(Ranking is a MAJOR contextual signal — champions and top-5 fighters have proven elite-level competition)\n=== END RANKINGS ===\n`
    : "";

  // UFCStats block
  const ufcStatsBlock = (ufcStatsA || ufcStatsB)
    ? [
        "\n=== UFC OFFICIAL CAREER STATS (ufcstats.com) ===",
        `\n--- ${fighterA} ---`,
        ufcStatsA ?? "No UFC stats available — rely on training knowledge.",
        `\n--- ${fighterB} ---`,
        ufcStatsB ?? "No UFC stats available — rely on training knowledge.",
        "=== END UFC STATS ===\n",
      ].join("\n")
    : "";

  // Build supplemental source blocks for each fighter
  const buildSupplemental = (name: string, tap: string | null, dec: string | null, espn: string | null, bfo: string | null, fm: string | null): string => {
    const parts: string[] = [];
    if (tap)  parts.push(`[Tapology] ${tap}`);
    if (dec)  parts.push(`[MMADecisions] ${dec}`);
    if (espn) parts.push(`[ESPN] ${espn}`);
    if        (bfo)  parts.push(`[BestFightOdds] ${bfo}`);
    if (fm)   parts.push(`[FightMatrix] ${fm}`);
    return parts.length ? `Supplemental sources for ${name}:\n${parts.join("\n")}` : "";
  };

  const suppA = buildSupplemental(fighterA, extra.tapCtxA, extra.decCtxA, extra.espnCtxA, extra.bfoCtxA, extra.fmCtxA);
  const suppB = buildSupplemental(fighterB, extra.tapCtxB, extra.decCtxB, extra.espnCtxB, extra.bfoCtxB, extra.fmCtxB);
  const supplementalBlock = (suppA || suppB)
    ? `\n=== SUPPLEMENTAL DATA SOURCES (Tapology · MMADecisions · ESPN · BestFightOdds · FightMatrix) ===\n${suppA}\n${suppB}\n=== END SUPPLEMENTAL ===\n`
    : "";

  // If NEITHER Sherdog NOR UFCStats is available, tell AI to rely on training knowledge
  const noStructuredData = !sherdogA && !sherdogB && !ufcStatsA && !ufcStatsB;
  const trainingKnowledgeNote = noStructuredData
    ? `\n⚠ NOTE: No structured database records retrieved for this matchup. Use your training knowledge about these fighters — their records, style, recent fights, and known tendencies. Be explicit that this analysis is based on AI training knowledge rather than real-time database lookup.\n`
    : "";

  const dataBlock = [
    rankingBlock,
    metricsBlock,
    commonOpponentsBlock || null,
    trainingKnowledgeNote,
    ufcStatsBlock,
    supplementalBlock,
    "=== FIGHT RECORD DATA (SHERDOG) ===",
    `\n--- ${fighterA} ---`,
    sherdogA ?? "No Sherdog data — use your training knowledge for this fighter.",
    `\n--- ${fighterB} ---`,
    sherdogB ?? "No Sherdog data — use your training knowledge for this fighter.",
    "=== END SHERDOG DATA ===",
  ].filter(Boolean).join("\n");

  const underdogResearch = `
=== FIGHT ANALYSIS FRAMEWORK ===
Market: ${favorite} is FAVORITE (${favOdds}, ~${favImpliedPct}% implied probability)
Market: ${underdog} is UNDERDOG (${dogOdds}, ~${dogImpliedPct}% implied probability)

IMPORTANT: Betting markets are efficient. The favorite is favored because their advantages are real.
To pick the underdog, you must find SPECIFIC evidence from the tape — not just because upsets happen.
${favImpliedPct >= 70 ? `This is a HEAVY FAVORITE at ${favImpliedPct}% implied. Require a clear, documented reason to fade them.` : `This is a COMPETITIVE matchup — analyze both sides carefully.`}

MANDATORY ANALYSIS — address ALL SEVEN in your reasoning:

1. PHYSICAL EDGES (from computed metrics above): Who has reach? Age? Stance advantage?
   → These are real, consistent advantages. A 4"+ reach edge matters in striking fights.

2. STRIKING BATTLE: From net strike differential (SLpM − SApM) — who wins exchanges on paper?
   Does their fight tape confirm or contradict the stats?
   → If stats and tape agree, that's a strong edge. If they disagree, trust the tape.

3. GRAPPLING PROJECTION: From TD efficiency numbers above — can the grappler land takedowns vs this opponent's defense?
   → If TD efficiency is low (<0.5 likely per 15min), the fight probably stays standing.

4. FINISH METHOD MATCH: How does ${favorite} lose when they lose?
   Does ${underdog}'s PRIMARY winning method match that pattern?
   → Only flag an upset if the underdog's BEST skill directly matches the favorite's DOCUMENTED weakness.
   → If they haven't shown this vulnerability before, the underdog path is theoretical, not real.

5. MOMENTUM & FORM: Check the pre-computed streak (from metrics above).
   → A fighter on a 3+ fight WIN streak at this level is sharp and evolving. Weight it.
   → A fighter on a LOSING streak has identifiable, exploitable weaknesses being game-planned. Weight it.
   → Long layoff (365d+) = ring rust in rounds 1-2. Who is rustier? Flag explicitly.

6. LINE MOVEMENT: From BestFightOdds supplemental data — which direction did the market move?
   → Line shortening toward a fighter (e.g. +180 → +110) = sharp money on them. Secondary signal.
   → Large movement (>60pts American) = strong market consensus. Incorporate it.
   → No BFO data? Skip this point.

7. VERDICT: Pick the fighter who has the genuine advantage.
   - If ${favorite}'s advantages are real and documented and ${underdog} has no specific counter → PICK THE FAVORITE.
   - If ${underdog} has a specific, tape-supported path AND matches ${favorite}'s loss pattern → PICK THE UNDERDOG.
   - Default is the favorite. Override only with evidence.
=== END FRAMEWORK ===`;

  return `Analyze this MMA fight with maximum analytical depth. Respond ONLY with valid JSON.

Fight: ${fighterA} vs ${fighterB}
Weight Class: ${weightClass}

${underdogResearch}

${dataBlock}

Required JSON structure:
{
  "fighter": "<winner pick — must be exactly '${fighterA}' or '${fighterB}'>",
  "confidence": "<strong or lean — NEVER toss-up>",
  "reasoning": "<7-9 paragraphs minimum, 500+ words. MANDATORY structure: (1) Opening thesis — one-sentence verdict and why, (2) Physical matchup analysis — address reach/age/stance from the computed metrics, (3) Striking exchange — use net strike diff and UFC career stats with actual numbers, (4) Grappling projection — use TD efficiency numbers, who takes it down and what happens there, (5) Tape analysis — what the Sherdog record reveals, specific opponents, finish methods, patterns, (6) Favorite's loss pattern — does the underdog's style match it?, (7) Underdog's path to victory — specific technique sequence, (8) Decision: why your pick wins and why the other path fails. Reference specific numbers, opponents, and methods throughout.>",
  "styleMatchup": "<2-3 paragraphs: the specific style friction, the range where this fight lives, and the X-factor that decides it. Name specific techniques and gameplans. Address the stance/reach dynamic.>",
  "upsetAnalysis": "<4-5 sentences. Who is the underdog? What is their specific path — name the technique/range/pattern. Does their primary win method match the favorite's documented loss pattern? Rate upset potential LOW/MEDIUM/HIGH with a one-sentence justification tied to the tape. Must have real content — never a placeholder.>",
  "keyEdges": [
    "<precise edge tied to computed metrics or Sherdog tape — e.g. '+3 inch reach advantage at striking range'>",
    "<another edge with specific numbers>",
    "<another>",
    "<another — minimum 4, maximum 6>"
  ],
  "riskFactors": [
    "<concrete scenario where your pick loses — name the exact technique, round, and sequence>",
    "<another risk>",
    "<another — minimum 2, maximum 4>"
  ],
  "commonOpponents": [
    {
      "opponent": "<shared opponent name>",
      "resultA": "<W or L>",
      "methodA": "<how ${fighterA} won/lost, e.g. TKO R2>",
      "resultB": "<W or L>",
      "methodB": "<how ${fighterB} won/lost>",
      "notes": "<what the shared tape reveals — compare HOW each performed, what was exposed, round finished, damage taken>"
    }
  ],
  "fighterAProfile": {
    "name": "${fighterA}",
    "style": "<primary style, e.g. 'Orthodox Pressure Kickboxer | Elite Wrestler'>",
    "strengths": ["<specific strength with stat backing>", "<another>", "<another>", "<another>"],
    "weaknesses": ["<weakness visible in losses or tape>", "<another>"],
    "recentForm": ["W", "L", "W", "W", "L"],
    "radarMetrics": { "striking": 7, "grappling": 6, "cardio": 8, "chin": 7, "power": 9, "defense": 6 }
  },
  "fighterBProfile": {
    "name": "${fighterB}",
    "style": "<primary style>",
    "strengths": ["<strength>", "<strength>", "<strength>", "<strength>"],
    "weaknesses": ["<weakness>", "<weakness>"],
    "recentForm": ["W", "W", "W", "L", "W"],
    "radarMetrics": { "striking": 8, "grappling": 5, "cardio": 7, "chin": 6, "power": 7, "defense": 8 }
  }
}

Rules:
- recentForm: last 5 fights from Sherdog, most recent first, "W" or "L" only.
- commonOpponents: ONLY use the pre-computed shared opponents from the "PRE-COMPUTED COMMON OPPONENTS" block above. If that block is present, populate it from there — do NOT invent opponents. If no shared opponents block was provided, output [].
- You MUST pick a winner. "toss-up" is never allowed.
- DEFAULT to the favorite unless you have SPECIFIC, DOCUMENTED tape evidence that the underdog's primary skill set exploits the favorite's loss pattern.
- Do NOT pick underdogs by default or out of contrarianism. Being an underdog is not a reason to pick them.
- Every keyEdge must be tied to a specific stat, physical attribute, computed metric, or Sherdog record moment.
- upsetAnalysis must have real analytical content — not boilerplate.
- Your reasoning MUST reference the streak and layoff data from the computed metrics. Momentum is real.
- If BFO line movement data is available, your reasoning MUST include one sentence on what the line movement signals.`;
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

  // ── Fetch ALL sources in parallel — 10 data sources ──────────────────
  logger.info(
    { fighterA: fight.fighterA, fighterB: fight.fighterB, favorite, underdog },
    "Fetching fighter data from 10 sources in parallel"
  );

  // Get ESPN IDs from fight metadata if available (passed via fight object extension)
  const espnIdA = (fight as any).espnIdA as string | undefined;
  const espnIdB = (fight as any).espnIdB as string | undefined;

  const [
    dataA, dataB,         // Sherdog (1, 2)
    statsA, statsB,       // UFCStats (3, 4)
    rankings,             // UFC Rankings (5)
    tapA, tapB,           // Tapology (6, 7)
    decA, decB,           // MMADecisions (8, 9)
    espnA, espnB,         // ESPN Fighter Stats (10, 11)
    bfoA, bfoB,           // BestFightOdds (12, 13)
    fmA, fmB,             // FightMatrix (14, 15)
  ] = await Promise.allSettled([
    getFighterData(fight.fighterA),
    getFighterData(fight.fighterB),
    getFighterStats(fight.fighterA),
    getFighterStats(fight.fighterB),
    getUfcRankings(),
    getTapologyData(fight.fighterA),
    getTapologyData(fight.fighterB),
    getMmaDecisionsData(fight.fighterA),
    getMmaDecisionsData(fight.fighterB),
    espnIdA ? getEspnFighterDetail(espnIdA) : Promise.resolve(null),
    espnIdB ? getEspnFighterDetail(espnIdB) : Promise.resolve(null),
    getBfoData(fight.fighterA),
    getBfoData(fight.fighterB),
    getFightMatrixData(fight.fighterA),
    getFightMatrixData(fight.fighterB),
  ]);

  const rawDataA   = dataA.status    === "fulfilled" ? dataA.value    : null;
  const rawDataB   = dataB.status    === "fulfilled" ? dataB.value    : null;
  const rawStatsA  = statsA.status   === "fulfilled" ? statsA.value   : null;
  const rawStatsB  = statsB.status   === "fulfilled" ? statsB.value   : null;
  const allRankings = rankings.status === "fulfilled" ? (rankings.value ?? []) : [];
  const rawTapA    = tapA.status     === "fulfilled" ? tapA.value     : null;
  const rawTapB    = tapB.status     === "fulfilled" ? tapB.value     : null;
  const rawDecA    = decA.status     === "fulfilled" ? decA.value     : null;
  const rawDecB    = decB.status     === "fulfilled" ? decB.value     : null;
  const rawEspnA   = espnA.status    === "fulfilled" ? espnA.value    : null;
  const rawEspnB   = espnB.status    === "fulfilled" ? espnB.value    : null;
  const rawBfoA    = bfoA.status     === "fulfilled" ? bfoA.value     : null;
  const rawBfoB    = bfoB.status     === "fulfilled" ? bfoB.value     : null;
  const rawFmA     = fmA.status      === "fulfilled" ? fmA.value      : null;
  const rawFmB     = fmB.status      === "fulfilled" ? fmB.value      : null;

  // Format each source
  const sherdogA   = rawDataA  ? formatSherdogContext(rawDataA)   : null;
  const sherdogB   = rawDataB  ? formatSherdogContext(rawDataB)   : null;
  const ufcStatsA  = rawStatsA ? formatUfcStatsContext(rawStatsA) : null;
  const ufcStatsB  = rawStatsB ? formatUfcStatsContext(rawStatsB) : null;
  const rankEntryA = lookupRanking(fight.fighterA, allRankings);
  const rankEntryB = lookupRanking(fight.fighterB, allRankings);
  const rankA      = formatRankingContext(rankEntryA, fight.fighterA);
  const rankB      = formatRankingContext(rankEntryB, fight.fighterB);
  const tapCtxA    = rawTapA  ? formatTapologyContext(rawTapA)           : null;
  const tapCtxB    = rawTapB  ? formatTapologyContext(rawTapB)           : null;
  const decCtxA    = rawDecA  ? formatMmaDecisionsContext(rawDecA)       : null;
  const decCtxB    = rawDecB  ? formatMmaDecisionsContext(rawDecB)       : null;
  const espnCtxA   = rawEspnA ? formatEspnFighterContext(rawEspnA)       : null;
  const espnCtxB   = rawEspnB ? formatEspnFighterContext(rawEspnB)       : null;
  const bfoCtxA    = rawBfoA  ? formatBfoContext(rawBfoA)                : null;
  const bfoCtxB    = rawBfoB  ? formatBfoContext(rawBfoB)                : null;
  const fmCtxA     = rawFmA   ? formatFightMatrixContext(rawFmA)         : null;
  const fmCtxB     = rawFmB   ? formatFightMatrixContext(rawFmB)         : null;

  // Log source coverage
  const sourcesA = [sherdogA && "Sherdog", ufcStatsA && "UFCStats", rankA && "Rankings",
    tapCtxA && "Tapology", decCtxA && "MMADecisions", espnCtxA && "ESPN", bfoCtxA && "BFO", fmCtxA && "FightMatrix"].filter(Boolean);
  const sourcesB = [sherdogB && "Sherdog", ufcStatsB && "UFCStats", rankB && "Rankings",
    tapCtxB && "Tapology", decCtxB && "MMADecisions", espnCtxB && "ESPN", bfoCtxB && "BFO", fmCtxB && "FightMatrix"].filter(Boolean);
  logger.info({ fighter: fight.fighterA, sources: sourcesA }, "Data sources loaded for fighter A");
  logger.info({ fighter: fight.fighterB, sources: sourcesB }, "Data sources loaded for fighter B");

  // Whether this is a main event / 5-round fight
  // Passed as an extension field from the fights route, or set by ESPN card order (espnOrder === 0)
  const isMainEvent: boolean = (fight as any).isMainEvent === true;

  // Pre-compute matchup metrics block for the AI prompt
  const metricsBlock = computeMatchupMetrics(
    fight.fighterA, fight.fighterB,
    rawDataA, rawDataB,
    rawStatsA, rawStatsB,
    isMainEvent
  );

  // Pre-compute common opponents from Sherdog records (prevents AI hallucination)
  const commonOpponentsBlock = findCommonOpponents(
    fight.fighterA, fight.fighterB,
    rawDataA, rawDataB
  );

  logger.info(
    { fightId: fight.id, fighterA: fight.fighterA, fighterB: fight.fighterB },
    "Calling Replit AI for fight analysis"
  );

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: 6000,
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
          sherdogB,
          ufcStatsA,
          ufcStatsB,
          metricsBlock,
          commonOpponentsBlock,
          isMainEvent,
          // Extra sources
          { rankA, rankB, tapCtxA, tapCtxB, decCtxA, decCtxB,
            espnCtxA, espnCtxB, bfoCtxA, bfoCtxB, fmCtxA, fmCtxB }
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
