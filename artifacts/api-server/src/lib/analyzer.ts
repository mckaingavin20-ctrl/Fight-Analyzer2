import { OddsFight, decimalToAmerican, trueProbs } from "./odds.js";

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
      reasoning:
        "No odds data available for this fight yet. Too early for the market to price this matchup.",
      keyEdges: [],
      riskFactors: ["No odds data — unable to assess market consensus"],
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
