---
name: AI analyzer upgrade
description: Data sources, prompt calibration, and pick bias fixes for the UFC AI analyzer
---

# AI Analyzer — Data Sources & Prompt

## Data Sources (15 total, fetched in parallel)
1. **Sherdog** — fight records, camp, nationality, finish breakdowns, layoff days
2. **UFCStats** — physical attributes (reach/stance/height/age), career strike/grappling averages
3. **ESPN** — event calendar, bout lineup, ESPN fighter IDs
4. **The Odds API** — live betting odds (decimal format)
5. **UFC Rankings** (`ufc-rankings.ts`) — ESPN + UFC.com scrape; 6h cache; major signal for top-5/champion context
6. **Tapology** (`tapology.ts`) — gym affiliation, nationality, comprehensive records including regional shows; 24h cache
7. **MMADecisions** (`mma-decisions.ts`) — decision win rate, judge scoring patterns; 48h cache
8. **BestFightOdds** (`bestfightodds.ts`) — historical closing odds, ATS record; 12h cache
9. **FightMatrix** (`fightmatrix.ts`) — algorithmic Elo ratings; 12h cache
10. **ESPN Fighter Detail** (`espn-fighter.ts`) — country, age, win/loss method breakdown from ESPN athlete API; 6h cache

## Name Search Improvements
- **Sherdog**: `generateNameVariations()` tries: full name → no-accents → last name only → first+last → reversed → filtered particles
- **UFCStats**: `nameSim` uses token overlap (0.6 threshold) + normalization + accent stripping; `candidateLetters()` includes accent-normalized variants
- Last-name-only Sherdog search confirmed working for Russian/Kazakh fighters (Ankalaev tested)

## Prompt Rules (anti-bias)
- DEFAULT to the favorite; override only with tape-documented evidence
- Heavy favorites (70%+ implied) require clear reason to fade
- "Do NOT pick underdogs by default or out of contrarianism"
- No Sherdog/UFCStats → AI uses training knowledge with explicit disclaimer

## Computed Metrics Block (pre-calculated before sending to AI)
All of these are injected into every prompt so the AI doesn't have to compute them:
- **Reach comparison** with significance label (slight/meaningful/SIGNIFICANT)
- **Age gap** with "decline range" flag for 36+
- **Stance matchup** — Orthodox vs Southpaw angle advantage
- **Net strike differential** (SLpM − SApM) — labeled as "strongest predictor of fight outcome"
- **TD efficiency** vs opponent's TD defense — projected TDs per 15min
- **KO/Sub vulnerability flags** — from Sherdog loss patterns (≥2 losses by same method)
- **Fight structure** — 3 ROUNDS vs 5 ROUNDS (main event detected via `?main=1` query param)
- **Win/loss streak** — pre-computed from Sherdog recentFights with "🔥" / "⚠" labels
- **Layoff comparison** — both fighters side-by-side with rust risk classification (fresh/normal/moderate/LONG)
- **Pre-computed common opponents** — cross-references both fighters' Sherdog recentFights; prevents AI hallucination in commonOpponents field

## System Prompt Additions (2025 upgrade)
New sections added to system prompt:
- **Momentum & Form** — win streaks are real signals; losing streaks = exploitable game-planned weaknesses
- **BFO Line Movement** — line shortening = sharp money; >60pt moves = strong consensus
- **FightMatrix Elo** — >150pt gap is significant; most reliable for 10+ rated fights; tie-breaker not primary
- **Camp Quality (Tapology)** — elite camps (AKA, Sanford, City Kickboxing, Tristar) give systematic advantages
- **Weight Class KO Variance** — HW/LHW: single punch always live, temper "strong" confidence; MW and below: volume/grappling more decisive

## Analysis Framework (mandatory checklist)
7 mandatory analysis points (was 5):
1. Physical edges (reach/age/stance)
2. Striking battle (net strike diff + tape confirmation)
3. Grappling projection (TD efficiency)
4. Finish method match (does underdog's win method match favorite's loss pattern)
5. **NEW** Momentum & form (streak + layoff comparison)
6. **NEW** Line movement (BFO data)
7. Verdict

## Rules in Prompt (updated)
- `commonOpponents`: MUST use pre-computed block if present; NEVER invent opponents
- reasoning MUST reference streak and layoff data
- If BFO data available, reasoning MUST include one sentence on line movement
- `isMainEvent` detection: front-end passes `?main=1` for main events; fights route reads `req.query.main`

## Pick Cache Rules
- Resolved picks (win/loss) NEVER cleared — disk cache with 7-day TTL
- Upcoming/pending fights cleared on demand to pick up new data sources
- `espn_NameA~~NameB` ID scheme for fights not in odds feed

**Why:** Ensures picks are locked forever post-analysis, but new fights get fresh multi-source data.
