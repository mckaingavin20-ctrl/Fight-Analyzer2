---
name: UFCStats Scraper
description: How UFCStats.com anti-bot works and how we solve it server-side
---

## UFCStats PoW challenge

UFCStats serves a SHA-256 proof-of-work browser challenge before returning real HTML.

**Challenge flow:**
1. GET any page → returns `<title>Loading…</title>` with inline JS
2. JS extracts `nonce` (hex string) and `targetLen` (typically 2 = "00" prefix)
3. Find integer `n` such that `SHA256(nonce + ':' + n)` starts with `'0'.repeat(targetLen)`
4. POST `nonce=...&n=...` to `http://ufcstats.com/__c` (Content-Type: application/x-www-form-urlencoded)
5. Response is 204 with `Set-Cookie: _fmc=...`
6. Re-fetch original URL with that cookie → real HTML

**Why:** Difficulty level ~2 zeros prefix is solved in <100 iterations, takes <1ms in Node.

## Implementation

- **File:** `artifacts/api-server/src/lib/ufcstats.ts`
- Session cookie cached in module-level `_session` (50 min TTL)
- `get(url)` helper auto-solves PoW when challenged, with 1 retry

## Fighter search

- Index URL: `http://ufcstats.com/statistics/fighters?char={letter}&page=all`
- Rows: `<tr>` with two `<a>` tags for first and last name; first `<a href>` links to fighter detail
- Fighter detail: `http://ufcstats.com/fighter-details/{hex-id}`
- Stats in `<li class="b-list__box-list-item">` elements, format `"Label: Value"`

**Compound name handling:** Try last word, second-to-last word, first name as letter candidates (covers "Du Plessis" → d or p, etc.)

## Available fighter stats

Physical: height, weight, reach, stance, DOB/age

Career averages (all scraped from `li` elements):
- `slpm` — strikes landed per minute
- `strAcc` — strike accuracy %
- `sapm` — strikes absorbed per minute
- `strDef` — strike defense %
- `tdAvg` — takedowns per 15 min
- `tdAcc` — takedown accuracy %
- `tdDef` — takedown defense %
- `subAvg` — submission attempts per 15 min

## Events

- Upcoming: `http://ufcstats.com/statistics/events/upcoming`
- Event detail: `http://ufcstats.com/event-details/{hex-id}`
- Bout rows contain `a[href*="fighter-details"]` for fighter links; weight class after "View Matchup" text

**Why:** UFCStats is the authoritative UFC stats source used by all major scrapers. PoW is solvable in pure Node with no headless browser needed.
