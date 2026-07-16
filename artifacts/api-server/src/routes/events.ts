import { Router } from "express";
import { getUpcomingEspnEvents, getEspnEventCard, eventDateWindow } from "../lib/espn.js";
import { fetchAllOddsFights, nameSimilarity } from "../lib/odds.js";

const router = Router();

router.get("/events", async (_req, res) => {
  const [events, allOddsFights] = await Promise.all([
    getUpcomingEspnEvents(),
    fetchAllOddsFights(),
  ]);

  // Only surface events that have at least one fight announced.
  // Fast check: use Odds API time-window (no ESPN card fetch needed per event).
  const withFights = events.filter((ev) => {
    const { from, to } = eventDateWindow(ev.date);
    return allOddsFights.some((f) => {
      const t = new Date(f.commenceTime);
      return t >= from && t <= to;
    });
  });

  // Return events that have odds coverage, or fall back to first 8 if none match
  return res.json(withFights.length ? withFights.slice(0, 8) : events.slice(0, 8));
});

router.get("/events/:eventId/card", async (req, res) => {
  const { eventId } = req.params;
  const events = await getUpcomingEspnEvents();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) {
    return res.status(404).json({ error: "Event not found" });
  }

  const { from, to } = eventDateWindow(ev.date);

  // ── Primary: ESPN bout lineup (UFC-only, exact card) ──────────────────
  const espnBouts = await getEspnEventCard(eventId, ev.date);

  // ── Fallback: Odds API when ESPN has no bouts yet ─────────────────────
  // (Safe for distant future events — non-UFC promotions rarely post odds months ahead)
  const allOddsFights = await fetchAllOddsFights();
  const windowOdds = allOddsFights.filter((f) => {
    const t = new Date(f.commenceTime);
    return t >= from && t <= to;
  });

  function findOddsMatch(nameA: string, nameB: string) {
    let best: (typeof windowOdds)[0] | null = null;
    let bestScore = 0;
    for (const f of windowOdds) {
      const scoreAB = nameSimilarity(nameA, f.fighterA) + nameSimilarity(nameB, f.fighterB);
      const scoreBA = nameSimilarity(nameA, f.fighterB) + nameSimilarity(nameB, f.fighterA);
      const score = Math.max(scoreAB, scoreBA);
      if (score > bestScore && score >= 1.0) { bestScore = score; best = f; }
    }
    return best;
  }

  if (espnBouts.length > 0) {
    // Sort: later timestamp first, then reverse ESPN order within same timestamp
    // so main event (last in ESPN) ends up at index 0
    const sorted = [...espnBouts].sort((a, b) => {
      const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.espnOrder - a.espnOrder;
    });

    const fights = sorted.map((bout, i) => {
      const odds = findOddsMatch(bout.fighterA.name, bout.fighterB.name);
      return {
        id: odds?.id ?? bout.boutUid,
        weightClass: "MMA",
        order: i,
        isMain: i === 0,
        fighterA: { name: bout.fighterA.name, record: "–", ufcStatsId: null },
        fighterB: { name: bout.fighterB.name, record: "–", ufcStatsId: null },
        ...(odds ? { oddsA: odds.oddsA, oddsB: odds.oddsB, oddsBook: odds.book } : {}),
      };
    });

    return res.json({ id: ev.id, name: ev.name, date: ev.date, venue: ev.venue, location: ev.location, fights });
  }

  // ── Odds-only fallback (future events with no ESPN card data yet) ──────
  if (windowOdds.length > 0) {
    const sorted = [...windowOdds].sort(
      (a, b) => new Date(b.commenceTime).getTime() - new Date(a.commenceTime).getTime()
    );
    const fights = sorted.map((f, i) => ({
      id: f.id,
      weightClass: "MMA",
      order: i,
      isMain: i === 0,
      fighterA: { name: f.fighterA, record: "–", ufcStatsId: null },
      fighterB: { name: f.fighterB, record: "–", ufcStatsId: null },
      oddsA: f.oddsA,
      oddsB: f.oddsB,
      oddsBook: f.book,
    }));
    return res.json({ id: ev.id, name: ev.name, date: ev.date, venue: ev.venue, location: ev.location, fights });
  }

  // No fight data available yet for this event
  return res.json({ id: ev.id, name: ev.name, date: ev.date, venue: ev.venue, location: ev.location, fights: [] });
});

export default router;
