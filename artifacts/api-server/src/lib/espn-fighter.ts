/**
 * ESPN MMA Fighter Stats API — detailed per-fight and career stats
 * from ESPN's athlete endpoint.
 *
 * ESPN IDs are already in the event card (from espn.ts) as `espnId`,
 * so we can look up rich fighter detail pages directly without search.
 *
 * Provides:
 * - Country / nationality
 * - Birth date / age
 * - Professional record
 * - Win/loss method breakdown (KO, Sub, Decision)
 * - Recent fight results with opponent
 *
 * Caches to disk for 6 hours.
 */
import axios from "axios";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc";

const CACHE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../.cache/espn-fighter"
);
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface EspnFighterDetail {
  espnId: string;
  name: string;
  country: string | null;
  dateOfBirth: string | null;
  age: number | null;
  weight: string | null;
  height: string | null;
  reach: string | null;
  stance: string | null;
  wins: number;
  losses: number;
  draws: number;
  winsByKo: number;
  winsBySub: number;
  winsByDec: number;
  lossByKo: number;
  lossBySub: number;
  lossByDec: number;
  streak: string | null;  // e.g. "5 Fight Win Streak"
  gym: string | null;
}

function cacheKey(id: string) { return `espn-${id}`; }
function readCache(id: string): EspnFighterDetail | null {
  try {
    const p = path.join(CACHE_DIR, `${cacheKey(id)}.json`);
    if (!fs.existsSync(p)) return null;
    if (Date.now() - fs.statSync(p).mtimeMs > CACHE_TTL) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}
function writeCache(data: EspnFighterDetail) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(data.espnId)}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

export async function getEspnFighterDetail(espnId: string): Promise<EspnFighterDetail | null> {
  if (!espnId || espnId.length < 3) return null;
  const cached = readCache(espnId);
  if (cached) return cached;

  try {
    const r = await axios.get<any>(`${ESPN_BASE}/athletes/${espnId}`, {
      headers: { "User-Agent": UA },
      timeout: 10000,
    });
    const a = r.data?.athlete ?? {};

    const findStat = (stats: any[], key: string): number => {
      const s = stats?.find((x: any) => x.name === key || x.displayName === key);
      return s ? parseInt(s.displayValue ?? s.value ?? "0", 10) : 0;
    };

    const stats = a.statistics?.splits?.[0]?.stats ?? a.statistics?.results?.[0]?.stats ?? [];
    const record = a.record?.items?.[0] ?? {};
    const recordStats = record.stats ?? [];

    const calcAge = (dob: string): number | null => {
      try {
        const d = new Date(dob);
        return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
      } catch { return null; }
    };

    const dob = a.dateOfBirth ?? null;
    const data: EspnFighterDetail = {
      espnId,
      name: a.displayName ?? a.fullName ?? "",
      country: a.birthPlace?.country?.displayName ?? a.citizenship ?? null,
      dateOfBirth: dob,
      age: dob ? calcAge(dob) : (a.age ?? null),
      weight: a.weight ? `${a.weight} lbs` : null,
      height: a.height ? `${Math.floor(a.height / 12)}'${a.height % 12}"` : null,
      reach: a.reach ?? null,
      stance: a.stance ?? null,
      wins: findStat(recordStats, "wins") || parseInt(record.summary?.split("-")[0] ?? "0", 10),
      losses: findStat(recordStats, "losses") || parseInt(record.summary?.split("-")[1] ?? "0", 10),
      draws: findStat(recordStats, "draws") || parseInt(record.summary?.split("-")[2] ?? "0", 10),
      winsByKo: findStat(stats, "KOs") || findStat(stats, "winsByKo") || findStat(recordStats, "winsByKo"),
      winsBySub: findStat(stats, "subs") || findStat(stats, "winsBySub") || findStat(recordStats, "winsBySub"),
      winsByDec: findStat(stats, "winsByDec") || findStat(recordStats, "winsByDec"),
      lossByKo: findStat(stats, "lossByKo") || findStat(recordStats, "lossByKo"),
      lossBySub: findStat(stats, "lossBySub") || findStat(recordStats, "lossBySub"),
      lossByDec: findStat(stats, "lossByDec") || findStat(recordStats, "lossByDec"),
      streak: a.streak?.displayValue ?? null,
      gym: a.gym ?? a.college ?? null,
    };

    writeCache(data);
    logger.info({ espnId, name: data.name, country: data.country }, "ESPN fighter detail fetched");
    return data;
  } catch (err) {
    logger.debug({ err, espnId }, "ESPN fighter detail fetch failed");
    return null;
  }
}

export function formatEspnFighterContext(data: EspnFighterDetail): string {
  const lines: string[] = [];
  if (data.country) lines.push(`Country: ${data.country}`);
  if (data.age) lines.push(`Age: ${data.age}`);
  if (data.streak) lines.push(`Current streak: ${data.streak}`);
  if (data.gym) lines.push(`Gym/affiliation: ${data.gym}`);

  const totalWins = data.wins;
  if (totalWins > 0) {
    const parts: string[] = [];
    if (data.winsByKo > 0) parts.push(`${data.winsByKo} KO/TKO`);
    if (data.winsBySub > 0) parts.push(`${data.winsBySub} Sub`);
    if (data.winsByDec > 0) parts.push(`${data.winsByDec} Dec`);
    if (parts.length) lines.push(`Win methods: ${parts.join(", ")}`);
  }
  if (data.losses > 0) {
    const parts: string[] = [];
    if (data.lossByKo > 0) parts.push(`${data.lossByKo} KO/TKO`);
    if (data.lossBySub > 0) parts.push(`${data.lossBySub} Sub`);
    if (data.lossByDec > 0) parts.push(`${data.lossByDec} Dec`);
    if (parts.length) lines.push(`Loss methods: ${parts.join(", ")}`);
  }
  return lines.join("\n");
}
