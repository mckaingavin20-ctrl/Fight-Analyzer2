import { createHash } from "node:crypto";

/** Canonical identity used for matching source records without inventing aliases. */
export function normalizeFighterName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join(" ");
}

export function fighterIdentityKey(name: string): string {
  return normalizeFighterName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface DataProvenance {
  source: "ufcstats" | "espn";
  sourceUrl: string;
  fetchedAt: string;
  freshnessMs: number;
  cached: boolean;
}

export interface Diagnostic {
  code: "SOURCE_UNAVAILABLE" | "FIGHTER_NOT_FOUND" | "STALE_CACHE" | "RATE_LIMITED" | "PARTIAL_CARD";
  message: string;
  source?: string;
}

const lastRequest = new Map<string, number>();
export async function withRateLimit<T>(source: string, fn: () => Promise<T>, minIntervalMs = 750): Promise<T> {
  const wait = Math.max(0, minIntervalMs - (Date.now() - (lastRequest.get(source) ?? 0)));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest.set(source, Date.now());
  return fn();
}

export function stableCacheKey(parts: string[]): string {
  return createHash("sha256").update(parts.map(fighterIdentityKey).join("|"), "utf8").digest("hex").slice(0, 24);
}
