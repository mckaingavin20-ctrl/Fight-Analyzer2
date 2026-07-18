---
name: AI Analyzer Upgrade
description: What was added to the fight analysis prompt/data pipeline to improve prediction accuracy
---

## What was added

### computeMatchupMetrics() in ai-analyzer.ts
Pre-calculates and injects a `=== COMPUTED MATCHUP METRICS ===` block BEFORE Sherdog/UFCStats data so the AI reasons from conclusions rather than recalculating:
- Reach gap (inches, with "SIGNIFICANT" flag at 4"+)
- Age gap (flags 36+ as decline range, 6+ year gap as meaningful)
- Stance: detects Orthodox vs Southpaw, cites ~6% southpaw win-rate edge
- Net strike differential = SLpM − SApM for each fighter (strongest single predictor)
- TD efficiency = TDAvg × TDAcc/100 × (1 − opponent TDDef/100) = actual expected TDs
- ⚠ vulnerability flags when a fighter has 2+ KO or Sub losses in Sherdog record
- Fight structure: 3-round vs 5-round declared explicitly

### Sherdog formatSherdogContext() upgrade (sherdog.ts)
Now includes computed summaries BEFORE the raw fight list:
- Win method breakdown: KO/TKO | Sub | Dec counts
- Finish rate %
- Loss method breakdown: how they've been stopped
- Layoff: days since last fight, with "⚠ LONG LAYOFF" flag at 365+ days

### Prompt structure
- System prompt expanded with ranked predictor list, stat interpretation thresholds, physical/stance/layoff frameworks
- buildPrompt now has a mandatory 5-point checklist the AI must address: loss-pattern, physical edge, net strike diff, grappling projection, finish-rate vs distance
- Reasoning now requires 7-9 paragraphs (500+ words) with MANDATORY structure
- keyEdges requires minimum 4 with stat backing
- max_completion_tokens bumped 3500 → 5000

**Why:** 80% accuracy was the baseline before these changes. The pre-computed block prevents the AI from glossing over physical/statistical matchup factors it might otherwise mention generically.

**How to apply:** These changes only affect NEW fight analyses. Cached analyses (existing fights) are locked on disk and will not be regenerated.
