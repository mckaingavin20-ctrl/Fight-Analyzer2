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
- TTL: 48h for upcoming fights (live in odds feed) — auto re-runs with fresh fighter data
- Completed fights (no longer in odds feed) bypass TTL — always served from cache (`readDiskCacheForce`)
- **Cache versioning**: `CACHE_VERSION = "v4"` embedded as `_v` in every cache envelope. Bump the version to force all old caches to regenerate with the new prompt. Legacy caches (no `_v`) are: expired for upcoming fights, served as-is for completed fights.
- `DELETE /api/fights/:fightId/analysis` endpoint clears cache for a specific fight
- Refresh button (↺) on each fight card in the UI calls this endpoint and invalidates React Query cache

**Why:** 48h TTL was right for upcoming fights but caused 404s for completed fights whose odds had left the feed. Force-read bypasses TTL without losing historical picks. Cache versioning auto-invalidates all servers (dev + prod) when the prompt changes — previously required manual cache clears.
