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

## Pick Cache Rules
- Resolved picks (win/loss) NEVER cleared — disk cache with 7-day TTL
- Upcoming/pending fights cleared on demand to pick up new data sources
- `espn_NameA~~NameB` ID scheme for fights not in odds feed

**Why:** Ensures picks are locked forever post-analysis, but new fights get fresh multi-source data.
