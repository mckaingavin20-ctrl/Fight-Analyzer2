import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const RECORD_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.cache/picks-record.json"
);

export interface PickEntry {
  fightId: string;
  /** Fighter name vs fighter name */
  matchup: string;
  eventDate: string;
  fighterPicked: string;
  opponent: string;
  confidence: string;
  pickedAt: string;
  result: "win" | "loss" | "pending";
  resolvedAt?: string;
}

interface PicksFile {
  picks: PickEntry[];
}

function readFile(): PicksFile {
  try {
    if (!fs.existsSync(RECORD_FILE)) return { picks: [] };
    return JSON.parse(fs.readFileSync(RECORD_FILE, "utf8")) as PicksFile;
  } catch {
    return { picks: [] };
  }
}

function writeFile(data: PicksFile): void {
  try {
    const dir = path.dirname(RECORD_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RECORD_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to write picks record");
  }
}

/** Record a pick the first time it's generated. No-op if already recorded. */
export function recordPick(
  fightId: string,
  fighterA: string,
  fighterB: string,
  eventDate: string,
  fighterPicked: string,
  confidence: string
): void {
  const data = readFile();
  if (data.picks.some((p) => p.fightId === fightId)) return;
  const opponent = fighterPicked === fighterA ? fighterB : fighterA;
  data.picks.push({
    fightId,
    matchup: `${fighterA} vs ${fighterB}`,
    eventDate,
    fighterPicked,
    opponent,
    confidence,
    pickedAt: new Date().toISOString(),
    result: "pending",
  });
  writeFile(data);
  logger.info({ fightId, fighterPicked, confidence }, "Pick recorded to tracker");
}

/** Update a pending pick with its real result. No-op if already resolved. */
export function resolvePickResult(fightId: string, result: "win" | "loss"): void {
  const data = readFile();
  const pick = data.picks.find((p) => p.fightId === fightId);
  if (!pick || pick.result !== "pending") return;
  pick.result = result;
  pick.resolvedAt = new Date().toISOString();
  writeFile(data);
  logger.info({ fightId, result }, "Pick resolved");
}

/** Return all pending picks whose event date has passed (fight should be done). */
export function getPendingResolvedNeeded(): PickEntry[] {
  const { picks } = readFile();
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h after scheduled time
  return picks.filter(
    (p) => p.result === "pending" && new Date(p.eventDate).getTime() < cutoff
  );
}

/** Aggregate stats + history for the /record endpoint. */
export function getPicksStats(): {
  picks: PickEntry[];
  wins: number;
  losses: number;
  pending: number;
  pct: number | null;
} {
  const { picks } = readFile();
  const wins = picks.filter((p) => p.result === "win").length;
  const losses = picks.filter((p) => p.result === "loss").length;
  const pending = picks.filter((p) => p.result === "pending").length;
  const total = wins + losses;
  return {
    picks: [...picks].sort(
      (a, b) => new Date(b.pickedAt).getTime() - new Date(a.pickedAt).getTime()
    ),
    wins,
    losses,
    pending,
    pct: total > 0 ? Math.round((wins / total) * 100) : null,
  };
}
