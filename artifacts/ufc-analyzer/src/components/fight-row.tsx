import { useState, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Legend,
} from 'recharts';
import { getGetFightAnalysisQueryKey } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FightCard, FighterStats } from '@workspace/api-client-react/src/generated/api.schemas';
import {
  ChevronDown, AlertCircle, ShieldAlert,
  Swords, Users, Loader2, TrendingUp, CheckCircle2, RefreshCw, Zap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FighterAvatar } from '@/components/fighter-avatar';
import { cn } from '@/lib/utils';

/* ── Types ─────────────────────────────────────────────────────────── */
interface RadarMetrics { striking: number; grappling: number; cardio: number; chin: number; power: number; defense: number; }
interface ExtendedFighterStats extends FighterStats { espnId?: string | null; radarMetrics?: RadarMetrics; }
interface ExtendedFightCard extends FightCard {
  fighterA: ExtendedFighterStats;
  fighterB: ExtendedFighterStats;
  pickResult?: 'win' | 'loss' | 'pending' | null;
  pickWinner?: string | null;
  gpPick?: string | null;
}
interface CommonOpponent { opponent: string; resultA: string; methodA: string; resultB: string; methodB: string; notes?: string; }
interface RichAnalysis {
  fightId: string; weightClass: string;
  fighterA: ExtendedFighterStats; fighterB: ExtendedFighterStats;
  commonOpponents: CommonOpponent[];
  odds: { fighterA: string; fighterB: string; book: string } | null;
  lean: { fighter: string; confidence: string; reasoning: string; keyEdges: string[]; riskFactors: string[]; };
  styleMatchup?: string | null; upsetAnalysis?: string | null;
  sherdogUsed?: { fighterA: boolean; fighterB: boolean };
}

/* ── Design tokens ──────────────────────────────────────────────────── */
const RED         = '#E11D48';
const RED_DIM     = 'rgba(225,29,72,0.08)';
const RED_BORDER  = 'rgba(225,29,72,0.22)';
const GOLD        = '#F59E0B';
const GOLD_DIM    = 'rgba(245,158,11,0.08)';
const GOLD_BORDER = 'rgba(245,158,11,0.22)';
const WIN_COLOR   = '#22C55E';
const LOSS_COLOR  = '#EF4444';
const SURFACE     = '#111113';
const ELEVATED    = '#18181B';
const BORDER      = 'rgba(255,255,255,0.08)';
const MUTED       = 'rgba(255,255,255,0.3)';

/* ── Odds helpers ───────────────────────────────────────────────────── */
type OddsFormat = 'american' | 'decimal' | 'probability';
function decimalToAmerican(d: number) { return d >= 2 ? `+${Math.round((d-1)*100)}` : `-${Math.round(100/(d-1))}`; }
function formatOdds(decimal: number) { return decimalToAmerican(decimal); }
function isFavorite(decimal: number) { return decimal < 2; }
function displayOdds(raw: string|number|undefined, format: OddsFormat): string {
  if (!raw) return '—';
  const str = String(raw).trim();
  let d: number;
  if (str.startsWith('-')) { const n = parseFloat(str.slice(1)); d = (100/n)+1; }
  else { const n = parseFloat(str.replace('+','')); d = (n/100)+1; }
  if (isNaN(d)) return str;
  if (format === 'american') return str;
  if (format === 'decimal') return d.toFixed(2);
  return `${Math.round((1/d)*100)}%`;
}

/* ── Radar derivation ───────────────────────────────────────────────── */
function deriveRadar(profile: ExtendedFighterStats): RadarMetrics {
  if (profile.radarMetrics) return profile.radarMetrics;
  const sw = (profile.strengths ?? []).join(' ').toLowerCase();
  const wk = (profile.weaknesses ?? []).join(' ').toLowerCase();
  const style = (profile.style ?? '').toLowerCase();
  const has = (t: string, kws: string[]) => kws.some(k => t.includes(k));
  let striking = 5;
  if (has(sw, ['striking','boxing','kick','punch','counter','combina','accurate','muay','karate'])) striking += 2;
  if (has(sw, ['sharp','precise','technical','elite'])) striking += 1;
  if (has(wk, ['striking','stand-up','poor feet','feet'])) striking -= 2;
  if (has(style, ['boxer','kickboxer','muay','striker'])) striking += 1;
  let grappling = 5;
  if (has(sw, ['wrestling','grappling','takedown','bjj','judo','submission','ground','clinch','sambo'])) grappling += 2;
  if (has(wk, ['takedown','grappling','wrestling','ground','submission'])) grappling -= 2;
  if (has(style, ['wrestler','grappler','bjj','judo','sambo'])) grappling += 1;
  let cardio = 6;
  if (has(sw, ['cardio','pace','gas tank','pressure','volume','relentless','engine','endurance'])) cardio += 2;
  if (has(wk, ['gas','fade','tired','cardio','pace','late rounds','engine'])) cardio -= 2;
  let chin = 6;
  if (has(sw, ['durable','chin','never finished','never stopped','iron','granite'])) chin += 2;
  if (has(wk, ['chin','hurt','knockdown','stopped','ko','tko','finished','wobbled'])) chin -= 2;
  let power = 5;
  if (has(sw, ['power','knockout','devastating','heavy hands','finish','one-punch','brutal'])) power += 2;
  if (has(wk, ['lacks power','no ko','power'])) power -= 2;
  let defense = 5;
  if (has(sw, ['defense','defensive','head movement','footwork','slipping','evasive','sprawl'])) defense += 2;
  if (has(wk, ['defense','hittable','open to','leaks','wide','gets hit'])) defense -= 2;
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  return { striking: clamp(striking), grappling: clamp(grappling), cardio: clamp(cardio), chin: clamp(chin), power: clamp(power), defense: clamp(defense) };
}

/* ── API base ───────────────────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '');

/* ── Fight status badge (LIVE / countdown) ──────────────────────────── */
function FightStatusBadge({ eventDate, isMain }: { eventDate?: string; isMain: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!eventDate) return null;

  // Estimate fight time: main event ≈ 5h after prelims start, other fights ≈ event time
  const eventMs = new Date(eventDate).getTime();
  const fightMs = isMain ? eventMs + 5 * 3600 * 1000 : eventMs;
  const diff    = fightMs - now; // negative = in the past

  // LIVE: fight time passed but within 4-hour window
  if (diff < 0 && Math.abs(diff) < 4 * 3600 * 1000) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: RED }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: RED }} />
        </span>
        <span style={{
          fontFamily: 'var(--app-font-mono)', fontSize: '9px',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: RED, fontWeight: 700,
        }}>LIVE</span>
      </div>
    );
  }

  // Countdown: within 6 hours
  if (diff > 0 && diff < 6 * 3600 * 1000) {
    const h  = Math.floor(diff / 3_600_000);
    const m  = Math.floor((diff % 3_600_000) / 60_000);
    const s  = Math.floor((diff % 60_000) / 1_000);
    const display = h > 0
      ? `${h}h ${String(m).padStart(2, '0')}m`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return (
      <div className="flex items-center gap-1" style={{
        fontFamily: 'var(--app-font-mono)', fontSize: '9px',
        letterSpacing: '0.1em', color: GOLD, fontWeight: 700,
      }}>
        <Zap className="w-2.5 h-2.5" />
        <span>{display}</span>
      </div>
    );
  }

  // Today badge (more than 6h away but still today)
  const fightDay = new Date(fightMs);
  const today    = new Date();
  if (fightDay.toDateString() === today.toDateString()) {
    return (
      <span style={{
        fontFamily: 'var(--app-font-mono)', fontSize: '8px',
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)', fontWeight: 700,
        border: '1px solid rgba(255,255,255,0.08)', padding: '1px 5px',
      }}>TODAY</span>
    );
  }

  return null;
}

/* ── Main component ─────────────────────────────────────────────────── */
export function FightRow({ fight: rawFight, eventDate }: { fight: FightCard; eventDate?: string }) {
  const fight = rawFight as ExtendedFightCard;
  const isCompleted = fight.pickResult === 'win' || fight.pickResult === 'loss';

  const [isExpanded, setIsExpanded]             = useState(false);
  const [oddsFormat, setOddsFormat]             = useState<OddsFormat>('american');
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing]         = useState(false);
  const qc = useQueryClient();

  const analysisUrl = `${BASE}/api/fights/${encodeURIComponent(fight.id)}/analysis${fight.isMain ? '?main=1' : ''}`;
  const { data: rawAnalysis, isLoading, isError } = useQuery<RichAnalysis>({
    queryKey: [...getGetFightAnalysisQueryKey(fight.id), fight.isMain ? 'main' : 'prelim'],
    queryFn: async ({ signal }) => {
      const r = await fetch(analysisUrl, { signal });
      if (!r.ok) throw new Error(`Analysis fetch failed: ${r.status}`);
      return r.json() as Promise<RichAnalysis>;
    },
    enabled: !!fight.id && !isCompleted,
    staleTime: 1000 * 60 * 60,
  });

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    if (isRefreshing || isLoading) return;
    setIsRefreshing(true);
    try {
      await fetch(`${BASE}/api/fights/${encodeURIComponent(fight.id)}/analysis`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: getGetFightAnalysisQueryKey(fight.id) });
    } finally {
      setIsRefreshing(false);
    }
  }

  /* ── Completed fight card ───────────────────────────────────────── */
  if (isCompleted) {
    const gpCorrect = fight.pickResult === 'win';
    const winner    = fight.pickWinner ?? '?';
    const isWinnerA = winner === fight.fighterA.name;
    const accentColor = gpCorrect ? WIN_COLOR : LOSS_COLOR;
    return (
      <div className="border overflow-hidden" style={{
        background: SURFACE,
        borderColor: gpCorrect ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
        opacity: 0.65,
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{
          background: gpCorrect ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
          borderColor: gpCorrect ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        }}>
          <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
            {fight.isMain ? '★ MAIN · ' : ''}{fight.weightClass || 'BOUT'} · FINAL
          </span>
          <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: accentColor }}>
            {gpCorrect ? '✓ Correct' : '✗ Wrong'}
          </span>
        </div>

        {/* Fighter row */}
        <div className="px-3 py-3 flex items-center gap-2">
          {/* Fighter A */}
          <div className={cn('flex-1 flex items-center gap-2.5 min-w-0', isWinnerA && 'opacity-100')} style={{ opacity: isWinnerA ? 1 : 0.4 }}>
            <FighterAvatar name={fight.fighterA.name} espnId={fight.fighterA.espnId} size="sm" />
            <div className="min-w-0">
              <p style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '13px', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.1, color: '#FAFAFA' }}>
                {fight.fighterA.name}
              </p>
              {isWinnerA && (
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: accentColor, fontWeight: 700 }}>WINNER</span>
              )}
            </div>
          </div>

          <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '10px', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.1em', flexShrink: 0 }}>VS</span>

          {/* Fighter B */}
          <div className="flex-1 flex items-center justify-end gap-2.5 min-w-0" style={{ opacity: !isWinnerA ? 1 : 0.4 }}>
            <div className="min-w-0 text-right">
              <p style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '13px', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.1, color: '#FAFAFA' }}>
                {fight.fighterB.name}
              </p>
              {!isWinnerA && (
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: accentColor, fontWeight: 700 }}>WINNER</span>
              )}
            </div>
            <FighterAvatar name={fight.fighterB.name} espnId={fight.fighterB.espnId} size="sm" />
          </div>
        </div>

        {/* GP Pick footer */}
        <div className="px-3 py-2 border-t flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>GP Pick</span>
          <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase', color: accentColor }}>
            {fight.gpPick ?? '?'}
          </span>
        </div>
      </div>
    );
  }

  const analysis  = rawAnalysis as RichAnalysis | undefined;
  const pick      = analysis?.lean?.fighter;
  const isPickA   = pick === fight.fighterA.name;
  const sid = (s: string) => `${fight.id}-${s}`;
  const scrollTo = (s: string) => document.getElementById(sid(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cycleOdds = () => setOddsFormat(f => f === 'american' ? 'decimal' : f === 'decimal' ? 'probability' : 'american');

  // Odds coloring: green = favorite (lower decimal), dim = underdog
  const oddsColorA = fight.oddsA ? (isFavorite(fight.oddsA) ? '#FAFAFA' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.25)';
  const oddsColorB = fight.oddsB ? (isFavorite(fight.oddsB) ? '#FAFAFA' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.25)';

  return (
    <div
      className="border overflow-hidden transition-all duration-150"
      style={{
        background: fight.isMain
          ? 'linear-gradient(135deg, #161418 0%, #18161a 100%)'
          : SURFACE,
        borderColor: isExpanded
          ? (fight.isMain ? GOLD_BORDER : RED_BORDER)
          : (fight.isMain ? 'rgba(245,158,11,0.18)' : BORDER),
      }}
    >

      {/* ── Header strip ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <span style={{
          fontFamily: 'var(--app-font-mono)', fontSize: '8px',
          letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          color: fight.isMain ? GOLD : 'rgba(255,255,255,0.2)',
        }}>
          {fight.isMain ? '★ MAIN EVENT' : fight.weightClass || 'BOUT'}
        </span>
        <div className="flex items-center gap-2.5">
          <FightStatusBadge eventDate={eventDate} isMain={fight.isMain ?? false} />
          {isLoading && (
            <span className="flex items-center gap-1 animate-pulse" style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase', color: RED }}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Scouting
            </span>
          )}
          {!isLoading && !isCompleted && (
            <button
              onClick={handleRefresh}
              title="Refresh analysis"
              className="p-1 hover:bg-white/5 transition-colors rounded"
              style={{ color: isRefreshing ? RED : 'rgba(255,255,255,0.15)' }}
            >
              <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>

      {/* ── Fighter matchup row (clickable) ── */}
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left px-3 pt-3 pb-2.5">

        {/* Fighter A | VS | Fighter B */}
        <div className="flex items-center gap-3">

          {/* Fighter A */}
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <FighterAvatar
                name={fight.fighterA.name}
                espnId={fight.fighterA.espnId}
                size="sm"
              />
              {pick && isPickA && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ background: GOLD, borderColor: fight.isMain ? '#161418' : SURFACE }}>
                  <CheckCircle2 className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p style={{
                fontFamily: 'var(--app-font-display)', fontWeight: 800,
                fontSize: 'clamp(12px, 2.8vw, 15px)', letterSpacing: '0.02em',
                textTransform: 'uppercase', lineHeight: 1.1,
                color: pick
                  ? (isPickA ? '#FAFAFA' : 'rgba(255,255,255,0.4)')
                  : '#FAFAFA',
              }}>{fight.fighterA.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {fight.oddsA && (
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontWeight: 700, fontSize: '12px', color: pick && isPickA ? GOLD : oddsColorA }}>
                    {formatOdds(fight.oddsA)}
                  </span>
                )}
                {analysis?.fighterA.style && (
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                    {analysis.fighterA.style.split('|')[0]?.trim()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* VS divider */}
          <div className="shrink-0 flex flex-col items-center justify-center gap-1 w-9">
            <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '10px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.1)', textTransform: 'uppercase' }}>VS</span>
          </div>

          {/* Fighter B */}
          <div className="flex-1 flex items-center justify-end gap-2.5 min-w-0 text-right">
            <div className="min-w-0 flex-1">
              <p style={{
                fontFamily: 'var(--app-font-display)', fontWeight: 800,
                fontSize: 'clamp(12px, 2.8vw, 15px)', letterSpacing: '0.02em',
                textTransform: 'uppercase', lineHeight: 1.1,
                color: pick
                  ? (!isPickA ? '#FAFAFA' : 'rgba(255,255,255,0.4)')
                  : '#FAFAFA',
              }}>{fight.fighterB.name}</p>
              <div className="flex items-center justify-end gap-2 mt-0.5 flex-wrap">
                {analysis?.fighterB.style && (
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                    {analysis.fighterB.style.split('|')[0]?.trim()}
                  </span>
                )}
                {fight.oddsB && (
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontWeight: 700, fontSize: '12px', color: pick && !isPickA ? GOLD : oddsColorB }}>
                    {formatOdds(fight.oddsB)}
                  </span>
                )}
              </div>
            </div>
            <div className="relative shrink-0">
              <FighterAvatar
                name={fight.fighterB.name}
                espnId={fight.fighterB.espnId}
                size="sm"
              />
              {pick && !isPickA && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ background: GOLD, borderColor: fight.isMain ? '#161418' : SURFACE }}>
                  <CheckCircle2 className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pick / status strip */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 min-w-0">
            {isLoading ? (
              <span className="animate-pulse" style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>Analyzing…</span>
            ) : isError ? (
              <div className="flex items-center gap-1.5" style={{ color: LOSS_COLOR }}>
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px' }}>Analysis failed</span>
              </div>
            ) : pick ? (
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700, flexShrink: 0 }}>GP PICK</span>
                <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: 'clamp(13px, 2.8vw, 15px)', letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, lineHeight: 1 }}>{pick}</span>
                <ConfidenceBadge confidence={analysis!.lean.confidence} />
              </div>
            ) : !analysis ? (
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tap to analyze</span>
            ) : null}
          </div>
          <ChevronDown
            className={cn('w-4 h-4 shrink-0 transition-transform duration-200', isExpanded && 'rotate-180')}
            style={{ color: isExpanded ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}
          />
        </div>
      </button>

      {/* ── Expanded analysis ── */}
      {isExpanded && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {isLoading ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2" style={{ color: RED }}>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: RED }}>Deep scouting in progress… first analysis takes up to 30s.</span>
              </div>
              <Skeleton className="h-5 w-1/3 bg-white/5" />
              <Skeleton className="h-28 w-full bg-white/5" />
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-6 h-6 mx-auto mb-3" style={{ color: LOSS_COLOR }} />
              <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Analysis unavailable. Try again in a moment.</p>
            </div>
          ) : analysis ? (
            <>
              {/* ── TL;DR Strip ── */}
              <div className="px-4 py-3 border-b" style={{ background: 'rgba(245,158,11,0.06)', borderColor: GOLD_BORDER }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '7px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>TL;DR</span>
                  <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '16px', letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, lineHeight: 1 }}>
                    {analysis.lean.fighter}
                  </span>
                  <ConfidenceBadge confidence={analysis.lean.confidence} />
                  {analysis.lean.keyEdges?.[0] && (
                    <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, flexBasis: '100%', marginTop: '2px' }}>
                      › {analysis.lean.keyEdges[0]}
                    </span>
                  )}
                </div>
              </div>

              {/* Sticky anchor nav */}
              <nav className="sticky top-0 z-30 flex items-center gap-0 overflow-x-auto border-b scrollbar-none"
                style={{ background: '#0D0D0F', borderColor: 'rgba(255,255,255,0.06)' }}>
                {[
                  { id: 'radar',   label: 'Stats' },
                  { id: 'verdict', label: 'Verdict' },
                  { id: 'edges',   label: 'Edges' },
                  { id: 'style',   label: 'Style',    show: !!analysis.styleMatchup },
                  { id: 'upset',   label: 'Upset',    show: !!analysis.upsetAnalysis },
                  { id: 'profiles',label: 'Fighters' },
                  { id: 'tape',    label: 'Tape',     show: (analysis.commonOpponents?.length ?? 0) > 0 },
                  { id: 'odds',    label: 'Odds',     show: !!analysis.odds },
                ].filter(n => n.show !== false).map(nav => (
                  <button key={nav.id} onClick={(e) => { e.stopPropagation(); scrollTo(nav.id); }}
                    className="px-4 py-2.5 whitespace-nowrap hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--app-font-display)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                    {nav.label}
                  </button>
                ))}
              </nav>

              <div className="p-4 sm:p-6 space-y-8">

                {/* ── Radar (moved to top — sells the matchup visually) ── */}
                <section id={sid('radar')}>
                  <SectionLabel color="rgba(255,255,255,0.4)">Fighter Stats Radar</SectionLabel>
                  <FighterRadar profileA={analysis.fighterA} profileB={analysis.fighterB} isPickA={isPickA} />
                </section>

                {/* ── Verdict ── */}
                <section id={sid('verdict')}>
                  <SectionLabel color={GOLD}>The Verdict</SectionLabel>
                  <div className="border p-5 space-y-4" style={{ background: GOLD_DIM, borderColor: GOLD_BORDER }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Pick:</span>
                      <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '22px', letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, lineHeight: 1 }}>
                        {analysis.lean.fighter}
                      </span>
                      <ConfidenceBadge confidence={analysis.lean.confidence} />
                    </div>
                    <div className="space-y-3" style={{ fontSize: '13px', lineHeight: 1.7, color: 'rgba(250,250,250,0.82)' }}>
                      {analysis.lean.reasoning.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  </div>
                </section>

                {/* ── Key Edges + Risk Factors ── */}
                <section id={sid('edges')} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <SectionLabel color={WIN_COLOR}>Key Edges</SectionLabel>
                    <ul className="space-y-1.5">
                      {analysis.lean.keyEdges?.map((edge, i) => (
                        <li key={i} className="flex items-start gap-2.5 border px-3 py-2.5" style={{ background: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.1)' }}>
                          <span style={{ color: WIN_COLOR, fontWeight: 900, flexShrink: 0, fontFamily: 'var(--app-font-display)', fontSize: '14px', lineHeight: 1 }}>›</span>
                          <span style={{ fontSize: '12px', lineHeight: 1.55, color: 'rgba(250,250,250,0.72)' }}>{edge}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <SectionLabel color={RED}><ShieldAlert className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />Risk Factors</SectionLabel>
                    <ul className="space-y-1.5">
                      {analysis.lean.riskFactors?.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2.5 border px-3 py-2.5" style={{ background: RED_DIM, borderColor: RED_BORDER }}>
                          <span style={{ color: RED, fontWeight: 900, flexShrink: 0, fontFamily: 'var(--app-font-display)', fontSize: '14px', lineHeight: 1 }}>›</span>
                          <span style={{ fontSize: '12px', lineHeight: 1.55, color: 'rgba(250,250,250,0.72)' }}>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                {/* ── Style Matchup ── */}
                {analysis.styleMatchup && (
                  <section id={sid('style')}>
                    <SectionLabel color="#818CF8"><Swords className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />Style Clash</SectionLabel>
                    <div className="border p-5 space-y-4" style={{ background: 'rgba(129,140,248,0.06)', borderColor: 'rgba(129,140,248,0.18)' }}>
                      <div className="flex items-center gap-3 pb-3 border-b flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                        <StyleTag style={analysis.fighterA.style ?? 'Fighter'} name={analysis.fighterA.name} />
                        <span style={{ color: 'rgba(129,140,248,0.7)', fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '12px' }}>VS</span>
                        <StyleTag style={analysis.fighterB.style ?? 'Fighter'} name={analysis.fighterB.name} />
                      </div>
                      <div className="space-y-2.5" style={{ fontSize: '13px', lineHeight: 1.7, color: 'rgba(250,250,250,0.78)' }}>
                        {analysis.styleMatchup.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    </div>
                  </section>
                )}

                {/* ── Upset Path ── */}
                {analysis.upsetAnalysis && (
                  <section id={sid('upset')}>
                    <SectionLabel color="#C084FC"><TrendingUp className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />Upset Path</SectionLabel>
                    <div className="border p-5 space-y-2.5" style={{ background: 'rgba(192,132,252,0.05)', borderColor: 'rgba(192,132,252,0.18)' }}>
                      <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'rgba(250,250,250,0.78)' }}>
                        {analysis.upsetAnalysis.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    </div>
                  </section>
                )}

                {/* ── Fighter Profiles ── */}
                <section id={sid('profiles')}>
                  <SectionLabel color="rgba(255,255,255,0.4)">Fighter Profiles</SectionLabel>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <FighterProfile profile={analysis.fighterA} isPickedFighter={isPickA} />
                    <FighterProfile profile={analysis.fighterB} isPickedFighter={!isPickA} />
                  </div>
                </section>

                {/* ── Common Opponents Tape ── */}
                {analysis.commonOpponents?.length > 0 && (
                  <section id={sid('tape')}>
                    <SectionLabel color="#60A5FA"><Users className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />Common Opponent Tape</SectionLabel>
                    <div className="space-y-2">
                      {analysis.commonOpponents.map((co, i) => (
                        <div key={i} className="border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedOpponent(prev => prev === co.opponent ? null : co.opponent); }}
                            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors border-b"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
                            <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{co.opponent}</span>
                            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200 text-white/20', expandedOpponent === co.opponent && 'rotate-180')} />
                          </button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <ResultCell name={analysis.fighterA.name} result={co.resultA} method={co.methodA} />
                            <ResultCell name={analysis.fighterB.name} result={co.resultB} method={co.methodB} />
                          </div>
                          {expandedOpponent === co.opponent && co.notes && (
                            <div className="px-4 py-3 border-t" style={{ background: 'rgba(96,165,250,0.06)', borderColor: 'rgba(96,165,250,0.15)' }}>
                              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#60A5FA', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Tape Analysis</span>
                              <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'rgba(250,250,250,0.72)' }}>{co.notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Odds ── */}
                {analysis.odds && (
                  <div id={sid('odds')} className="pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
                      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700, width: '100%', display: 'block', marginBottom: '-4px' }}>
                        Book Odds ({analysis.odds.book || 'Market'})
                      </span>
                      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                        {analysis.fighterA.name}: <strong style={{ color: '#FAFAFA' }}>{displayOdds(analysis.odds.fighterA, oddsFormat)}</strong>
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                        {analysis.fighterB.name}: <strong style={{ color: '#FAFAFA' }}>{displayOdds(analysis.odds.fighterB, oddsFormat)}</strong>
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); cycleOdds(); }}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1 border hover:bg-white/10 transition-colors"
                        style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                        <RefreshCw className="w-2.5 h-2.5" />
                        {oddsFormat === 'american' ? 'American' : oddsFormat === 'decimal' ? 'Decimal' : 'Implied %'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Section label ──────────────────────────────────────────────────── */
function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-0.5 h-4 rounded-full shrink-0" style={{ background: color }} />
      <h3 style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
        {children}
      </h3>
    </div>
  );
}

/* ── Confidence badge ───────────────────────────────────────────────── */
function ConfidenceBadge({ confidence }: { confidence: string }) {
  const isStrong = confidence === 'strong';
  return (
    <span className="border px-2 py-0.5" style={isStrong
      ? { background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)', color: GOLD, fontFamily: 'var(--app-font-mono)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }
      : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--app-font-mono)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }
    }>
      {isStrong ? '🔒 LOCK' : confidence}
    </span>
  );
}

/* ── Style tag ──────────────────────────────────────────────────────── */
function StyleTag({ style, name }: { style: string; name: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{name}</span>
      <span className="border px-2 py-0.5 truncate" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--app-font-mono)', fontSize: '10px', fontWeight: 700 }}>{style}</span>
    </div>
  );
}

/* ── Result cell ─────────────────────────────────────────────────────── */
function ResultCell({ name, result, method }: { name: string; result: string; method: string }) {
  const isWin = result?.toUpperCase() === 'W';
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span className="w-5 h-5 flex items-center justify-center text-[10px] font-black shrink-0 border"
        style={isWin
          ? { background: 'rgba(34,197,94,0.12)', color: WIN_COLOR, borderColor: 'rgba(34,197,94,0.2)', fontFamily: 'var(--app-font-display)' }
          : { background: 'rgba(239,68,68,0.12)', color: LOSS_COLOR, borderColor: 'rgba(239,68,68,0.2)', fontFamily: 'var(--app-font-display)' }
        }>{result}</span>
      <div className="min-w-0">
        <div style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{name}</div>
        <div style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{method}</div>
      </div>
    </div>
  );
}

/* ── Fighter profile ─────────────────────────────────────────────────── */
function FighterProfile({ profile, isPickedFighter }: { profile: ExtendedFighterStats; isPickedFighter: boolean }) {
  return (
    <div className="border p-4 space-y-4" style={{
      background: isPickedFighter ? GOLD_DIM : 'rgba(255,255,255,0.02)',
      borderColor: isPickedFighter ? GOLD_BORDER : 'rgba(255,255,255,0.07)',
    }}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h4 style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '16px', letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.1 }}>{profile.name}</h4>
          <span className="inline-block border mt-1.5 px-2 py-0.5" style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
            {profile.style?.split('|')[0]?.trim() || 'MMA'}
          </span>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[120px]">
          {profile.recentForm?.map((res, i) => (
            <span key={i} className="flex items-center justify-center w-5 h-5 text-[9px] font-black border"
              style={res === 'W'
                ? { background: 'rgba(34,197,94,0.1)', color: WIN_COLOR, borderColor: 'rgba(34,197,94,0.2)', fontFamily: 'var(--app-font-display)' }
                : res === 'L'
                ? { background: 'rgba(239,68,68,0.1)', color: LOSS_COLOR, borderColor: 'rgba(239,68,68,0.2)', fontFamily: 'var(--app-font-display)' }
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.08)', fontFamily: 'var(--app-font-display)' }
              }>{res}</span>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[
          { label: 'Strengths',  items: profile.strengths,  borderColor: 'rgba(34,197,94,0.2)',  bg: 'rgba(34,197,94,0.07)',  color: '#86EFAC' },
          { label: 'Weaknesses', items: profile.weaknesses, borderColor: 'rgba(239,68,68,0.2)',  bg: 'rgba(239,68,68,0.07)',  color: '#FCA5A5' },
        ].map(({ label, items, borderColor, bg, color }) => (
          <div key={label}>
            <h5 style={{ fontFamily: 'var(--app-font-mono)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>{label}</h5>
            <div className="flex flex-wrap gap-1.5">
              {items?.map((s, i) => (
                <span key={i} className="border px-2 py-0.5" style={{ borderColor, background: bg, color, fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.06em' }}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Radar chart ─────────────────────────────────────────────────────── */
const RADAR_DIMS = ['Striking','Grappling','Cardio','Chin','Power','Defense'] as const;
type RadarDim = typeof RADAR_DIMS[number];
const DIM_KEY_MAP: Record<RadarDim, keyof RadarMetrics> = {
  Striking:'striking', Grappling:'grappling', Cardio:'cardio', Chin:'chin', Power:'power', Defense:'defense',
};

function FighterRadar({ profileA, profileB, isPickA }: { profileA: ExtendedFighterStats; profileB: ExtendedFighterStats; isPickA: boolean }) {
  const metricsA = deriveRadar(profileA);
  const metricsB = deriveRadar(profileB);
  const data = RADAR_DIMS.map(dim => ({
    metric: dim,
    [profileA.name]: metricsA[DIM_KEY_MAP[dim]],
    [profileB.name]: metricsB[DIM_KEY_MAP[dim]],
    fullMark: 10,
  }));
  const colorA = isPickA ? GOLD : '#818CF8';
  const colorB = !isPickA ? GOLD : '#818CF8';

  return (
    <div className="border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
          <Radar name={profileA.name} dataKey={profileA.name} stroke={colorA} fill={colorA} fillOpacity={0.14} strokeWidth={2} />
          <Radar name={profileB.name} dataKey={profileB.name} stroke={colorB} fill={colorB} fillOpacity={0.14} strokeWidth={2} />
          <Legend
            wrapperStyle={{ fontSize: '8px', fontFamily: 'JetBrains Mono, monospace', paddingTop: '8px', letterSpacing: '0.08em' }}
            formatter={(value) => <span style={{ color: value === profileA.name ? colorA : colorB, textTransform: 'uppercase' }}>{value}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
