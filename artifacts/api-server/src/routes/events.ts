import { Router } from "express";
import { getUpcomingEspnEvents, eventDateWindow } from "../lib/espn.js";
import { fetchAllOddsFights } from "../lib/odds.js";

const router = Router();

router.get("/events", async (_req, res) => {
  const events = await getUpcomingEspnEvents();
  // Only return events that have at least one fight in the Odds API
  const allFights = await fetchAllOddsFights();
  const filtered = events.filter((ev) => {
    const { from, to } = eventDateWindow(ev.date);
    return allFights.some((f) => {
      const t = new Date(f.commenceTime);
      return t >= from && t <= to;
    });
  });
  // If none match, return all upcoming ESPN events so app isn't empty
  return res.json(filtered.length ? filtered : events.slice(0, 8));
});

router.get("/events/:eventId/card", async (req, res) => {
  const { eventId } = req.params;
  const events = await getUpcomingEspnEvents();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) {
    return res.status(404).json({ error: "Event not found" });
  }

  const { from, to } = eventDateWindow(ev.date);
  const allFights = await fetchAllOddsFights();
  const cardFights = allFights
    .filter((f) => {
      const t = new Date(f.commenceTime);
      return t >= from && t <= to;
    })
    .sort((a, b) => new Date(b.commenceTime).getTime() - new Date(a.commenceTime).getTime());

  const fights = cardFights.map((f, i) => ({
    id: f.id,
    weightClass: "MMA",
    order: i,
    isMain: i === 0,
    fighterA: { name: f.fighterA, record: "–", ufcStatsId: null },
    fighterB: { name: f.fighterB, record: "–", ufcStatsId: null },
  }));

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
