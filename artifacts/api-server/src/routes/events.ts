import { Router } from "express";
import { getUpcomingEspnEvents, getEspnEventCard, eventDateWindow } from "../lib/espn.js";
import { fetchAllOddsFights, nameSimilarity } from "../lib/odds.js";
import { getPicksStats } from "../lib/picks-tracker.js";

const router = Router();

router.get("/events", async (_req, res) => {
  const [events, allOddsFights] = await Promise.all([
    getUpcomingEspnEvents(),
    fetchAllOddsFights(),
  ]);

  // Tag each event with whether odds are available yet (used by the client to show "Odds TBD")
  const tagged = events.map((ev) => {
    const { from, to } = eventDateWindow(ev.date);
    const hasOdds = allOddsFights.some((f) => {
      const t = new Date(f.commenceTime);
      return t >= from && t <= to;
    });
    return { ...ev, hasOdds };
  });

  // Always return all known upcoming events (up to 8), sorted by date ascending
  return res.json(tagged.slice(0, 8));
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

  // Build pick result map for enriching each fight card
  const { picks } = getPicksStats();
  const pickMap = new Map(picks.map((p) => [p.fightId, p]));

  // Fuzzy name match — strips non-alpha for comparison
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const nameSim = (a: string, b: string) => {
    const na = normName(a), nb = normName(b);
    return na === nb || na.includes(nb) || nb.includes(na);
  };

  function enrichWithPick(fightId: string, nameA: string, nameB: string) {
    // 1. Exact fight-ID match (live fights still in odds feed)
    let pick = pickMap.get(fightId);

    // 2. Name-based fallback (completed fights — odds gone, ESPN UID used as ID)
    if (!pick) {
      pick = picks.find((p) =>
        (nameSim(p.fighterPicked, nameA) && nameSim(p.opponent, nameB)) ||
        (nameSim(p.fighterPicked, nameB) && nameSim(p.opponent, nameA))
      );
    }

    if (!pick) return {};
    const winner =
      pick.result === "win" ? pick.fighterPicked
      : pick.result === "loss" ? pick.opponent
      : null;
    return { pickResult: pick.result, pickWinner: winner, gpPick: pick.fighterPicked };
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
      const fightId = odds?.id ?? bout.boutUid;
      return {
        id: fightId,
        weightClass: "MMA",
        order: i,
        isMain: i === 0,
        fighterA: { name: bout.fighterA.name, record: "–", ufcStatsId: null, espnId: bout.fighterA.espnId || null },
        fighterB: { name: bout.fighterB.name, record: "–", ufcStatsId: null, espnId: bout.fighterB.espnId || null },
        ...(odds ? { oddsA: odds.oddsA, oddsB: odds.oddsB, oddsBook: odds.book } : {}),
        ...enrichWithPick(fightId, bout.fighterA.name, bout.fighterB.name),
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
      ...enrichWithPick(f.id, f.fighterA, f.fighterB),
    }));
    return res.json({ id: ev.id, name: ev.name, date: ev.date, venue: ev.venue, location: ev.location, fights });
  }

  // No fight data available yet for this event
  return res.json({ id: ev.id, name: ev.name, date: ev.date, venue: ev.venue, location: ev.location, fights: [] });
});

export default router;
