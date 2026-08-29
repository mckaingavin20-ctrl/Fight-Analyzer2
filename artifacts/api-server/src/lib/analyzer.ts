import { OddsFight, decimalToAmerican, trueProbs } from "./odds.js";
import type { UfcStatsFighterStats } from "./ufcstats.js";

export function analyzeFromStats(
  fighterA: UfcStatsFighterStats | null,
  fighterB: UfcStatsFighterStats | null,
): { summary: string; warnings: string[]; evidence: string[] } {
  const warnings: string[] = [];
  const evidence: string[] = [];
  if (!fighterA || !fighterB) warnings.push("Verified UFCStats data is missing for one or both fighters.");
  if (fighterA && fighterB) {
    const aNet = fighterA.slpm !== null && fighterA.sapm !== null ? fighterA.slpm - fighterA.sapm : null;
    const bNet = fighterB.slpm !== null && fighterB.sapm !== null ? fighterB.slpm - fighterB.sapm : null;
    if (aNet !== null && bNet !== null) evidence.push(`Net striking differential: ${fighterA.name} ${aNet.toFixed(2)} vs ${fighterB.name} ${bNet.toFixed(2)} landed per minute.`);
    else warnings.push("Net striking differential is unavailable because one or more source fields are missing.");
    if (fighterA.tdDef !== null && fighterB.tdAvg !== null) evidence.push(`${fighterB.name} averages ${fighterB.tdAvg} takedowns per 15 minutes against ${fighterA.name}'s ${fighterA.tdDef}% takedown defense.`);
    if (fighterB.tdDef !== null && fighterA.tdAvg !== null) evidence.push(`${fighterA.name} averages ${fighterA.tdAvg} takedowns per 15 minutes against ${fighterB.name}'s ${fighterB.tdDef}% takedown defense.`);
  }
  return { summary: evidence.length ? "Educational comparison based only on verified source fields. It is not a prediction." : "Not enough verified data for a responsible matchup comparison.", warnings, evidence };
}


export interface AnalysisLean {
  fighter: string;
  confidence: "strong" | "lean" | "toss-up";
  reasoning: string;
  keyEdges: string[];
  riskFactors: string[];
}

export function analyzeFromOdds(
  fight: OddsFight
): AnalysisLean {
  const { fighterA, fighterB, oddsA, oddsB } = fight;

  // No odds available
  if (!oddsA || !oddsB) {
    return {
      fighter: fighterA,
      confidence: "toss-up",
      reasoning: "Verified fighter data is unavailable. No evidence-based comparison can be made yet.",
      keyEdges: [],
      riskFactors: ["Missing verified fighter statistics"],
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
  const dogPct = 100 - favPct;

  // Confidence tier
  let confidence: "strong" | "lean" | "toss-up";
  if (favProb >= 0.68) confidence = "strong";
  else if (favProb >= 0.57) confidence = "lean";
  else confidence = "toss-up";

  // Build reasoning
  const lines: string[] = [];

  lines.push(
    `The market prices ${favorite} as a ${favOdds} favorite (${favPct}% implied win probability) against ${underdog} at ${dogOdds} (${dogPct}%).`
  );

  if (confidence === "strong") {
    lines.push(
      `At ${favPct}%+ implied probability, the betting market has significant conviction here. Sharp money and public consensus both line up behind ${favorite}. This level of certainty in MMA is meaningful — it typically reflects a genuine skill or style edge that analysts and the market agree on.`
    );
    lines.push(
      `Fading a ${favPct}% favorite in MMA requires a strong counter-narrative. Absent one, the market's read is the best available signal.`
    );
  } else if (confidence === "lean") {
    lines.push(
      `At ${favPct}% implied probability, the market has a moderate lean toward ${favorite} but acknowledges real uncertainty. This is the most common zone in MMA — a stylistic or experience edge that isn't quite dominant enough to call a lock.`
    );
    lines.push(
      `${underdog} at ${dogOdds} carries real upset potential. MMA's variance means any fight in this range can go either way — the pick is directional, not a certainty.`
    );
  } else {
    lines.push(
      `At ${favPct}% vs ${dogPct}%, the market sees this as essentially a coin flip. The vig-adjusted lines suggest neither fighter holds a clear edge in the collective view of sharp bettors. Pick with extreme caution.`
    );
    lines.push(
      `Toss-ups like this are best left alone or picked on live momentum — pre-fight the market is telling you it doesn't know.`
    );
  }

  const keyEdges: string[] = [
    `Market consensus: ${favPct}% implied win probability for ${favorite}`,
    `Odds: ${favorite} ${favOdds} vs ${underdog} ${dogOdds} (${fight.book})`,
    `Sharp market pricing across multiple books`,
  ];

  const riskFactors: string[] = [
    `MMA is inherently high-variance — even ${favPct}% favorites lose ~${100 - favPct}% of the time`,
    `Late scratches, undisclosed injuries, and weight cut issues can flip any fight`,
  ];

  if (confidence === "toss-up") {
    riskFactors.push("Market uncertainty is high — underdog has legitimate path to victory");
  }

  return {
    fighter: favorite,
    confidence,
    reasoning: lines.join(" "),
    keyEdges,
    riskFactors,
  };
}
