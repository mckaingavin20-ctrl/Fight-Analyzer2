import { Router } from "express";
import { getUpcomingUfcStatsEvents, getEventBouts } from "../lib/ufcstats.js";
import { getUpcomingEspnEvents, getEspnEventCard } from "../lib/espn.js";
import { normalizeFighterName } from "../lib/fighter-data.js";
import { logger } from "../lib/logger.js";

const router = Router();
const isAllowedUfcEvent = (name: string) => {
  const value = name.toLowerCase();
  return value.includes("ufc") && !value.includes("contender") && !value.includes("dwcs") && !value.includes("dana white's contender") && !value.includes("dana white contender");
};

router.get("/events", async (_req, res) => {
  try {
    const events = (await getUpcomingUfcStatsEvents())
      .filter((event) => isAllowedUfcEvent(event.name))
      .map(({ id, name, date, location }) => ({ id, name, date, venue: null, location: location || null, source: "ufcstats", fetchedAt: new Date().toISOString() }));
    return res.json(events);
  } catch (error) {
    logger.warn({ error }, "UFCStats schedule unavailable, trying ESPN");
    try {
      const events = (await getUpcomingEspnEvents())
        .filter((event) => isAllowedUfcEvent(event.name))
        .map((event) => ({ ...event, source: "espn", fetchedAt: new Date().toISOString() }));
      return res.json(events);
    } catch (fallbackError) {
      logger.error({ fallbackError }, "All UFC schedule sources failed");
      return res.status(503).json({ error: "UFC schedule is temporarily unavailable", diagnostics: { sources: ["ufcstats", "espn"], retryable: true } });
    }
  }
});

router.get("/events/:eventId/card", async (req, res) => {
  const { eventId } = req.params;
  try {
    const events = (await getUpcomingUfcStatsEvents()).filter((event) => isAllowedUfcEvent(event.name));
    const event = events.find((candidate) => candidate.id === eventId);
    if (event) {
      const bouts = await getEventBouts(event.id, event.url);
      const fights = bouts.map((bout, order) => ({
        id: `${event.id}_${order}`,
        weightClass: bout.weightClass || "Unknown",
        order,
        isMain: order === 0,
        fighterA: { name: normalizeFighterName(bout.fighterA), record: "Unknown", ufcStatsId: null },
        fighterB: { name: normalizeFighterName(bout.fighterB), record: "Unknown", ufcStatsId: null },
        source: "ufcstats",
      }));
      return res.json({ id: event.id, name: event.name, date: event.date, venue: null, location: event.location || null, fights, diagnostics: { source: "ufcstats", completeCard: fights.length > 0, includesPrelims: fights.length > 1, fetchedAt: new Date().toISOString() } });
    }
  } catch (error) {
    logger.warn({ error, eventId }, "UFCStats card unavailable, trying ESPN");
  }

  try {
    const events = (await getUpcomingEspnEvents()).filter((candidate) => isAllowedUfcEvent(candidate.name));
    const event = events.find((candidate) => candidate.id === eventId);
    if (!event) return res.status(404).json({ error: "UFC event not found" });
    const bouts = await getEspnEventCard(event.id, event.date);
    const fights = bouts.map((bout, order) => ({
      id: `espn_${normalizeFighterName(bout.fighterA.name)}~~${normalizeFighterName(bout.fighterB.name)}`,
      weightClass: "Unknown",
      order,
      isMain: order === bouts.length - 1,
      fighterA: { name: normalizeFighterName(bout.fighterA.name), record: "Unknown", ufcStatsId: null },
      fighterB: { name: normalizeFighterName(bout.fighterB.name), record: "Unknown", ufcStatsId: null },
      source: "espn",
    }));
    return res.json({ ...event, fights, diagnostics: { source: "espn", completeCard: fights.length > 0, includesPrelims: fights.length > 1, fetchedAt: new Date().toISOString() } });
  } catch (error) {
    logger.error({ error, eventId }, "UFC card sources failed");
    return res.status(503).json({ error: "UFC card is temporarily unavailable", diagnostics: { sources: ["ufcstats", "espn"], retryable: true } });
  }
});

export default router;
