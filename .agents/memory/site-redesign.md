---
name: Site Redesign — Combat Broadcast
description: Design system and token decisions from the full visual redesign; needed for consistency on any future UI changes.
---

# Design System — Combat Broadcast

**Concept:** ESPN broadcast overlay meets editorial sports magazine. Stark, high-contrast, authoritative. Completely different from the old neon-navy-gold-violet aesthetic.

## Color Tokens
| Purpose | Value |
|---------|-------|
| Background | `#09090B` (near-black) |
| Surface | `#111113` |
| Elevated | `#18181B` |
| Border | `rgba(255,255,255,0.08)` |
| **Primary accent** | `#E11D48` (blood red — replaced violet) |
| **Pick highlight** | `#F59E0B` (gold — kept for picks only) |
| Win | `#22C55E` |
| Loss | `#EF4444` |
| Red dim | `rgba(225,29,72,0.08)` |
| Red border | `rgba(225,29,72,0.22)` |

## Typography
- **Display / headlines / fighter names / section labels:** `Barlow Condensed` 700–900, uppercase, `var(--app-font-display)`
- **Body / analysis text / UI labels:** `Inter`, `var(--app-font-sans)`
- **Data / odds / record numbers / mono labels:** `JetBrains Mono`, `var(--app-font-mono)`

Loaded via Google Fonts in `index.css`. CSS variable `--app-font-display` is set in `:root`.

## Key Layout Decisions
- No border-radius on cards/buttons (sharp edges = broadcast aesthetic)
- Section labels use a colored left-border bar (1px vertical), not an icon+text combo
- Fight cards: fighter-A | VS | fighter-B horizontal layout, no nested expansion buttons
- Pick banner: gold gradient strip below fighters, fighter name in Barlow Condensed
- Record tab: Broadcast scoreboard with big W/L numbers at top, filter chips below
- Schedule tab: Compact date blocks (red when odds live), hard-border row items

## Analysis Cache
- TTL changed from 7 days → 48 hours for non-resolved fights (auto re-runs with fresh fighter data)
- `DELETE /api/fights/:fightId/analysis` endpoint clears cache for a specific fight
- Refresh button (↺) on each fight card in the UI calls this endpoint and invalidates React Query cache

**Why:** Future fights were never re-analyzed after initial generation because the 7-day TTL was too long. Now they re-run every 48h and users can force-refresh manually.
