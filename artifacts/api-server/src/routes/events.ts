import { Router } from "express";
import { getUpcomingEspnEvents, getEspnEventCard, eventDateWindow } from "../lib/espn.js";
import { fetchAllOddsFights, nameSimilarity } from "../lib/odds.js";

const router = Router();

router.get("/events", async (_req, res) => {
  const events = await getUpcomingEspnEvents();
  // Return up to 8 upcoming events (ESPN is already filtered to UFC only)
  return res.json(events.slice(0, 8));
});

router.get("/events/:eventId/card", async (req, res) => {
  const { eventId } = req.params;
  const events = await getUpcomingEspnEvents();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) {
    return res.status(404).json({ error: "Event not found" });
  }

  // ── Source of truth: ESPN bout lineup (real UFC fights only) ──────────
  const espnBouts = await getEspnEventCard(eventId, ev.date);

  // ── Enrich with odds from The Odds API by name-matching ───────────────
  const allOddsFights = await fetchAllOddsFights();

  // Only consider odds fights within the event time window
  const { from, to } = eventDateWindow(ev.date);
  const windowOdds = allOddsFights.filter((f) => {
    const t = new Date(f.commenceTime);
    return t >= from && t <= to;
  });

  function findOddsMatch(nameA: string, nameB: string) {
    let best: (typeof windowOdds)[0] | null = null;
    let bestScore = 0;
    for (const f of windowOdds) {
      // Try both orientations
      const scoreAB =
        nameSimilarity(nameA, f.fighterA) + nameSimilarity(nameB, f.fighterB);
      const scoreBA =
        nameSimilarity(nameA, f.fighterB) + nameSimilarity(nameB, f.fighterA);
      const score = Math.max(scoreAB, scoreBA);
      if (score > bestScore && score >= 1.0) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  // Sort: later timestamp first (main card before early prelims),
  // then by ESPN order descending within same timestamp (main event → opening bout).
  // ESPN always returns bouts in ascending card order within a segment,
  // so reversing that order puts the main event at position 0.
  const sorted = [...espnBouts].sort((a, b) => {
    const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.espnOrder - a.espnOrder; // main event last in ESPN → first here
  });

  const fights = sorted.map((bout, i) => {
    const odds = findOddsMatch(bout.fighterA.name, bout.fighterB.name);
    return {
      id: odds?.id ?? bout.boutUid,
      weightClass: "MMA",
      order: i,
      isMain: i === 0,
      fighterA: {
        name: bout.fighterA.name,
        record: "–",
        ufcStatsId: null,
      },
      fighterB: {
        name: bout.fighterB.name,
        record: "–",
        ufcStatsId: null,
      },
      ...(odds
        ? {
            oddsA: odds.oddsA,
            oddsB: odds.oddsB,
            oddsBook: odds.book,
          }
        : {}),
    };
  });

  return res.json({
    id: ev.id,
    name: ev.name,
    date: ev.date,
    venue: ev.venue,
    location: ev.location,
    fights,
  });
});

export default router;
