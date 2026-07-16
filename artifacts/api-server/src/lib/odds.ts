import axios from "axios";
import { logger } from "./logger.js";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export interface OddsFight {
  id: string;
  commenceTime: string;
  fighterA: string;
  fighterB: string;
  oddsA: number | null;  // decimal odds for fighterA
  oddsB: number | null;  // decimal odds for fighterB
  book: string;
}

interface OddsApiOutcome { name: string; price: number; }
interface OddsApiMarket { key: string; outcomes: OddsApiOutcome[]; }
interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: OddsApiMarket[];
  }>;
}

let oddsCache: { data: OddsFight[]; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Fuzzy fighter-name similarity after normalization (item 4).
 * Both names are lowercased and stripped of non-alpha characters, then compared:
 *   1.0  — exact match after normalization
 *   0.85 — one name is a substring of the other (handles "Islam Makhachev" vs "Makhachev")
 *   0.80 — last 7 chars match (handles suffix/suffix-only API differences)
 *   0.0  — no match
 * A threshold of ≥ 0.75 is used when matching ESPN names to Odds API names.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const lastA = na.slice(-7);
  const lastB = nb.slice(-7);
  if (lastA === lastB && lastA.length > 3) return 0.8;
  return 0;
}

export async function fetchAllOddsFights(): Promise<OddsFight[]> {
  if (oddsCache && Date.now() - oddsCache.at < CACHE_TTL) {
    return oddsCache.data;
  }

  const apiKey = process.env["ODDS_API_KEY"];
  if (!apiKey) {
    logger.warn("ODDS_API_KEY not set");
    return [];
  }

  // item 7: retry up to 2 times with backoff (free tier: ~500 req/day; deduplicated by in-memory cache)
  let res: Awaited<ReturnType<typeof axios.get<OddsApiEvent[]>>>;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      res = await axios.get<OddsApiEvent[]>(
        `${ODDS_API_BASE}/sports/mma_mixed_martial_arts/odds`,
        {
          params: { apiKey, regions: "us,uk", markets: "h2h", oddsFormat: "decimal" },
          timeout: 12000,
        }
      );
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  if (!res!) throw lastErr;

  const fights: OddsFight[] = res.data.map((ev) => {
    // Pick the first bookmaker with h2h market
    let oddsA: number | null = null;
    let oddsB: number | null = null;
    let book = "";

    for (const bm of ev.bookmakers) {
      const h2h = bm.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const outcomes = h2h.outcomes;

      // home_team is fighterA, away_team is fighterB
      const oA = outcomes.find(
        (o) => nameSimilarity(o.name, ev.home_team) > 0.75
      );
      const oB = outcomes.find(
        (o) => nameSimilarity(o.name, ev.away_team) > 0.75
      );

      if (oA && oB) {
        oddsA = oA.price;
        oddsB = oB.price;
        book = bm.title;
        break;
      } else if (outcomes.length >= 2) {
        oddsA = outcomes[0].price;
        oddsB = outcomes[1].price;
        book = bm.title;
        break;
      }
    }

    return {
      id: ev.id,
      commenceTime: ev.commence_time,
      fighterA: ev.home_team,
      fighterB: ev.away_team,
      oddsA,
      oddsB,
      book,
    };
  });

  oddsCache = { data: fights, at: Date.now() };
  logger.info({ count: fights.length }, "Fetched MMA odds fights");
  return fights;
}

export function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) return `+${Math.round((decimal - 1) * 100)}`;
  return `${Math.round(-100 / (decimal - 1))}`;
}

export function impliedProb(decimal: number): number {
  return 1 / decimal;
}

/** Remove the vig to get true implied win probabilities */
export function trueProbs(oddsA: number, oddsB: number): { probA: number; probB: number } {
  const rawA = impliedProb(oddsA);
  const rawB = impliedProb(oddsB);
  const total = rawA + rawB;
  return { probA: rawA / total, probB: rawB / total };
}
