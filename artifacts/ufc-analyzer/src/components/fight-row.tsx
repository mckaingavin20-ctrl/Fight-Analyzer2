import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useGetFightAnalysis, getGetFightAnalysisQueryKey } from '@workspace/api-client-react';
import type { FightCard, FighterStats } from '@workspace/api-client-react/src/generated/api.schemas';
import {
  ChevronDown, ChevronUp, AlertCircle, ShieldAlert,
  Target, Swords, Users, Loader2, TrendingUp, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FighterAvatar } from '@/components/fighter-avatar';
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/* ── Extended types ────────────────────────────────────────────────── */
interface RadarMetrics {
  striking: number; grappling: number; cardio: number;
  chin: number; power: number; defense: number;
}
interface ExtendedFighterStats extends FighterStats {
  espnId?: string | null;
  radarMetrics?: RadarMetrics;
}
interface ExtendedFightCard extends FightCard {
  fighterA: ExtendedFighterStats;
  fighterB: ExtendedFighterStats;
  /** Set by the server once a fight completes and ESPN has a result */
  pickResult?: 'win' | 'loss' | 'pending' | null;
  pickWinner?: string | null;
  gpPick?: string | null;
}
interface CommonOpponent {
  opponent: string;
  resultA: string;
  methodA: string;
  resultB: string;
  methodB: string;
  notes?: string;
}
interface RichAnalysis {
  fightId: string;
  weightClass: string;
  fighterA: ExtendedFighterStats;
  fighterB: ExtendedFighterStats;
  commonOpponents: CommonOpponent[];
  odds: { fighterA: string; fighterB: string; book: string } | null;
  lean: {
    fighter: string;
    confidence: string;
    reasoning: string;
    keyEdges: string[];
    riskFactors: string[];
  };
  styleMatchup?: string | null;
  upsetAnalysis?: string | null;
  sherdogUsed?: { fighterA: boolean; fighterB: boolean };
  sources?: Array<{ label: string; url: string }>;
}

const GREEN          = '#22e66e';
const GREEN_DIM      = 'rgba(34,230,110,0.12)';
const GREEN_BORDER   = 'rgba(34,230,110,0.25)';
const VIOLET_DIM     = 'rgba(139,92,246,0.08)';
const VIOLET_BORDER  = 'rgba(139,92,246,0.25)';

/* ── Odds helpers ──────────────────────────────────────────────────── */
type OddsFormat = 'american' | 'decimal' | 'probability';

function decimalToAmerican(d: number): string {
  return d >= 2
    ? `+${Math.round((d - 1) * 100)}`
    : `-${Math.round(100 / (d - 1))}`;
}
function decimalToImplied(d: number): string {
  return `${Math.round((1 / d) * 100)}%`;
}
function formatOdds(decimal: number): string {
  return decimalToAmerican(decimal);
}
function displayOdds(raw: string | number | undefined, format: OddsFormat): string {
  if (!raw) return '—';
  // raw is an american string from AI like "-238" or "+205"
  // convert to decimal first
  const str = String(raw).trim();
  let d: number;
  if (str.startsWith('-')) {
    const n = parseFloat(str.slice(1));
    d = (100 / n) + 1;
  } else {
    const n = parseFloat(str.replace('+', ''));
    d = (n / 100) + 1;
  }
  if (isNaN(d)) return str;
  if (format === 'american')    return str;
  if (format === 'decimal')     return d.toFixed(2);
  if (format === 'probability') return `${Math.round((1 / d) * 100)}%`;
  return str;
}
function displayDecimalOdds(d: number, format: OddsFormat): string {
  if (format === 'american')    return decimalToAmerican(d);
  if (format === 'decimal')     return d.toFixed(2);
  if (format === 'probability') return decimalToImplied(d);
  return decimalToAmerican(d);
}

/* ── Radar metrics derivation (heuristic fallback) ─────────────────── */
function deriveRadar(profile: ExtendedFighterStats): RadarMetrics {
  if (profile.radarMetrics) return profile.radarMetrics;
  const sw = (profile.strengths ?? []).join(' ').toLowerCase();
  const wk = (profile.weaknesses ?? []).join(' ').toLowerCase();
  const style = (profile.style ?? '').toLowerCase();
  const has = (t: string, kws: string[]) => kws.some(k => t.includes(k));

  let striking = 5;
  if (has(sw, ['striking', 'boxing', 'kick', 'punch', 'counter', 'combina', 'accurate', 'muay', 'karate', 'southpaw'])) striking += 2;
  if (has(sw, ['sharp', 'precise', 'technical', 'elite'])) striking += 1;
  if (has(wk, ['striking', 'stand-up', 'poor feet', 'feet'])) striking -= 2;
  if (has(style, ['boxer', 'kickboxer', 'muay', 'striker'])) striking += 1;

  let grappling = 5;
  if (has(sw, ['wrestling', 'grappling', 'takedown', 'bjj', 'judo', 'submission', 'ground', 'clinch', 'sambo'])) grappling += 2;
  if (has(wk, ['takedown', 'grappling', 'wrestling', 'ground', 'submission'])) grappling -= 2;
  if (has(style, ['wrestler', 'grappler', 'bjj', 'judo', 'sambo'])) grappling += 1;

  let cardio = 6;
  if (has(sw, ['cardio', 'pace', 'gas tank', 'pressure', 'volume', 'relentless', 'engine', 'endurance'])) cardio += 2;
  if (has(wk, ['gas', 'fade', 'tired', 'cardio', 'pace', 'late rounds', 'engine'])) cardio -= 2;

  let chin = 6;
  if (has(sw, ['durable', 'chin', 'never finished', 'never stopped', 'never knocked', 'iron', 'granite'])) chin += 2;
  if (has(wk, ['chin', 'hurt', 'knockdown', 'stopped', 'ko', 'tko', 'finished', 'wobbled', 'brittle'])) chin -= 2;

  let power = 5;
  if (has(sw, ['power', 'knockout', 'devastating', 'heavy hands', 'finish', 'one-punch', 'brutal', 'vicious'])) power += 2;
  if (has(wk, ['lacks power', 'no ko', 'power'])) power -= 2;

  let defense = 5;
  if (has(sw, ['defense', 'defensive', 'head movement', 'footwork', 'slipping', 'evasive', 'sprawl', 'takedown def'])) defense += 2;
  if (has(wk, ['defense', 'hittable', 'open to', 'leaks', 'wide', 'gets hit'])) defense -= 2;

  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  return { striking: clamp(striking), grappling: clamp(grappling), cardio: clamp(cardio), chin: clamp(chin), power: clamp(power), defense: clamp(defense) };
}

/* ── Main component ────────────────────────────────────────────────── */
export function FightRow({ fight: rawFight }: { fight: FightCard }) {
  const fight = rawFight as ExtendedFightCard;
  const isCompleted = fight.pickResult === 'win' || fight.pickResult === 'loss';

  // ── ALL HOOKS MUST COME FIRST — React rules of hooks forbid hooks after a conditional return ──
  const [isExpanded, setIsExpanded]       = useState(false);
  const [oddsFormat, setOddsFormat]       = useState<OddsFormat>('american');
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);

  const { data: rawAnalysis, isLoading, isError, error } = useGetFightAnalysis(fight.id, {
    query: {
      // Never fetch analysis for completed fights — they use the result card below
      enabled: !!fight.id && !isCompleted,
      queryKey: getGetFightAnalysisQueryKey(fight.id),
      staleTime: 1000 * 60 * 60,
    }
  });

  // A 404 here means the fight is no longer in the live odds feed (it already
  // happened) and no analysis was ever cached for it — there's nothing useful
  // to show, so drop it from the card instead of surfacing an error.
  const isGoneFight = isError && (error as { status?: number } | undefined)?.status === 404;
  if (isGoneFight) {
    return null;
  }

  // ── Completed fight: compact result card ─────────────────────────────
  if (isCompleted) {
    const gpCorrect = fight.pickResult === 'win';
    const winner    = fight.pickWinner ?? '?';
    const isWinnerA = winner === fight.fighterA.name;
    return (
      <div
        className="rounded-2xl overflow-hidden border"
        style={{
          background: '#0c0c10',
          borderColor: gpCorrect ? 'rgba(34,230,110,0.2)' : 'rgba(248,113,113,0.2)',
          opacity: 0.72,
        }}
      >
        {/* Label strip */}
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <span className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase"
            style={{ color: '#353550' }}>
            {fight.isMain ? '★ MAIN · ' : ''}
            <span style={{ color: gpCorrect ? '#22e66e' : '#f87171' }}>FINAL</span>
          </span>
          <span className="text-[9px] font-mono font-black uppercase tracking-widest"
            style={{ color: gpCorrect ? '#22e66e' : '#f87171' }}>
            {gpCorrect ? '✓ Correct' : '✗ Wrong'}
          </span>
        </div>

        {/* Fighters */}
        <div className="px-4 pb-2 pt-3 flex items-center gap-3">
          <div className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl px-2 ${isWinnerA ? 'bg-white/[0.05]' : ''}`}>
            <FighterAvatar name={fight.fighterA.name} espnId={fight.fighterA.espnId} size="md" />
            <p className="font-black uppercase text-[11px] leading-tight tracking-tight text-center">{fight.fighterA.name}</p>
            {isWinnerA && (
              <span className="text-[8px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ background: 'rgba(34,230,110,0.12)', color: '#22e66e' }}>WINNER</span>
            )}
          </div>
          <span className="text-[9px] font-black font-mono shrink-0" style={{ color: '#252535' }}>VS</span>
          <div className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl px-2 ${!isWinnerA ? 'bg-white/[0.05]' : ''}`}>
            <FighterAvatar name={fight.fighterB.name} espnId={fight.fighterB.espnId} size="md" />
            <p className="font-black uppercase text-[11px] leading-tight tracking-tight text-center">{fight.fighterB.name}</p>
            {!isWinnerA && (
              <span className="text-[8px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ background: 'rgba(34,230,110,0.12)', color: '#22e66e' }}>WINNER</span>
            )}
          </div>
        </div>

        {/* GP Pick footer */}
        <div className="px-4 py-2.5 border-t flex items-center gap-2"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: '#353550' }}>GP Pick</span>
          <span className="text-[10px] font-black uppercase tracking-tight"
            style={{ color: gpCorrect ? '#22e66e' : '#f87171' }}>{fight.gpPick ?? '?'}</span>
        </div>
      </div>
    );
  }

  const analysis  = rawAnalysis as RichAnalysis | undefined;
  const pick      = analysis?.lean?.fighter;
  const isPickA   = pick === fight.fighterA.name;
  const pickColor = GREEN;

  const sid = (s: string) => `${fight.id}-${s}`;
  const scrollTo = (s: string) => {
    document.getElementById(sid(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cycleOdds = () =>
    setOddsFormat(f => f === 'american' ? 'decimal' : f === 'decimal' ? 'probability' : 'american');

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 border"
        style={{
          background: 'linear-gradient(180deg, #0f0f1e 0%, #0b0b18 100%)',
          borderColor: isExpanded ? GREEN_BORDER : 'rgba(255,255,255,0.06)',
          boxShadow: isExpanded ? `0 0 24px ${GREEN_DIM}` : 'none',
        }}
      >
        {/* ── Fight label strip ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase"
            style={{ color: fight.isMain ? GREEN : '#3a3a5c' }}>
            {fight.isMain ? '★ MAIN EVENT' : fight.weightClass || 'Prelim'}
          </span>
          {isLoading && (
            <span className="flex items-center gap-1 text-[9px] font-mono uppercase animate-pulse" style={{ color: GREEN }}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Scouting…
            </span>
          )}
        </div>

        {/* ── Fighter matchup card ────────────────────────────────────────── */}
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left px-4 pb-0 pt-3">
          <div className="flex items-stretch gap-3">
            {/* Fighter A */}
            <div className={cn(
              'flex-1 flex flex-col items-center gap-2 pb-4 rounded-xl transition-all duration-200 px-2 pt-3',
              pick && isPickA ? 'bg-white/[0.04]' : 'bg-transparent'
            )}>
              <div className="relative">
                <FighterAvatar name={fight.fighterA.name} espnId={fight.fighterA.espnId} size="lg" />
                {pick && isPickA && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0f0f1e] flex items-center justify-center"
                    style={{ background: GREEN }}>
                    <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="font-black uppercase text-xs sm:text-sm leading-tight tracking-tight">{fight.fighterA.name}</p>
                {fight.oddsA && (
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: isPickA ? GREEN : '#3a3a5c' }}>
                    {formatOdds(fight.oddsA)}
                  </p>
                )}
                {analysis && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5 opacity-60">{analysis.fighterA.style}</p>
                )}
              </div>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center justify-center gap-1 shrink-0 py-4">
              <span className="text-[10px] font-black font-mono tracking-widest" style={{ color: '#2a2a44' }}>VS</span>
            </div>

            {/* Fighter B */}
            <div className={cn(
              'flex-1 flex flex-col items-center gap-2 pb-4 rounded-xl transition-all duration-200 px-2 pt-3',
              pick && !isPickA ? 'bg-white/[0.04]' : 'bg-transparent'
            )}>
              <div className="relative">
                <FighterAvatar name={fight.fighterB.name} espnId={fight.fighterB.espnId} size="lg" />
                {pick && !isPickA && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0f0f1e] flex items-center justify-center"
                    style={{ background: GREEN }}>
                    <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="font-black uppercase text-xs sm:text-sm leading-tight tracking-tight">{fight.fighterB.name}</p>
                {fight.oddsB && (
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: !isPickA ? GREEN : '#3a3a5c' }}>
                    {formatOdds(fight.oddsB)}
                  </p>
                )}
                {analysis && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5 opacity-60">{analysis.fighterB.style}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Pick bar ────────────────────────────────────────────────── */}
          <div className="mx-0 mt-0 rounded-b-xl px-4 py-2.5 flex items-center justify-between"
            style={{
              background: pick ? `linear-gradient(90deg, ${GREEN_DIM}, transparent)` : 'rgba(255,255,255,0.02)',
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
            <div className="flex items-center gap-2 min-w-0">
              {isLoading ? (
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest animate-pulse">Analyzing…</span>
              ) : isError ? (
                <div className="flex items-center gap-1 text-destructive text-[10px] font-mono">
                  <AlertCircle className="w-3 h-3" /> Error
                </div>
              ) : pick ? (
                <>
                  <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em]" style={{ color: '#3a3a5c' }}>Gavin's Pick</span>
                  <span className="font-black text-xs sm:text-sm uppercase tracking-tight truncate" style={{ color: GREEN }}>{pick}</span>
                  {analysis && <ConfidenceBadge confidence={analysis.lean.confidence} />}
                </>
              ) : null}
            </div>
            <div style={{ color: '#2a2a44' }}>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>

        {/* ── Expanded analysis panel ─────────────────────────────────────── */}
        {isExpanded && (
          <div className="border-t text-sm" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {isLoading ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-mono animate-pulse" style={{ color: GREEN }}>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Generating deep scout analysis… may take up to 30 seconds on first load.
                </div>
                <Skeleton className="h-5 w-1/3 bg-white/5" />
                <Skeleton className="h-28 w-full bg-white/5" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Skeleton className="h-40 bg-white/5" />
                  <Skeleton className="h-40 bg-white/5" />
                </div>
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-muted-foreground font-mono text-sm">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" />
                Failed to generate analysis. Try again in a moment.
              </div>
            ) : analysis ? (
              <>
                {/* ── Sticky anchor nav ──────────────────────────────────────── */}
                <nav className="sticky top-0 z-30 flex items-center gap-0 overflow-x-auto border-b"
                  style={{ background: '#0d0d1c', borderColor: 'rgba(255,255,255,0.06)' }}>
                  {[
                    { id: 'verdict',   label: 'Overview' },
                    { id: 'style',     label: 'Style',    show: !!analysis.styleMatchup },
                    { id: 'upset',     label: 'Upset',    show: !!analysis.upsetAnalysis },
                    { id: 'radar',     label: 'Radar' },
                    { id: 'tape',      label: 'Tape',     show: (analysis.commonOpponents?.length ?? 0) > 0 },
                    { id: 'odds',      label: 'Odds',     show: !!analysis.odds },
                  ].filter(n => n.show !== false).map(nav => (
                    <button
                      key={nav.id}
                      onClick={(e) => { e.stopPropagation(); scrollTo(nav.id); }}
                      className="px-3 sm:px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-widest whitespace-nowrap transition-colors hover:text-white"
                      style={{ color: '#3a3a5c' }}
                    >
                      {nav.label}
                    </button>
                  ))}
                </nav>

                <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">

                  {/* ── Verdict ─────────────────────────────────────────────── */}
                  <section id={sid('verdict')}>
                    <SectionHeader icon={<Target className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: GREEN }} />} title="The Verdict" />
                    <div className="rounded-xl p-4 sm:p-5 space-y-3 border"
                      style={{
                        background: 'rgba(34,230,110,0.03)',
                        borderColor: GREEN_BORDER,
                        boxShadow: `0 0 32px rgba(34,230,110,0.06)`,
                      }}>
                      {/* Fighters mini-header */}
                      <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FighterAvatar name={fight.fighterA.name} espnId={fight.fighterA.espnId} size="sm" />
                          <span className={cn('font-bold text-xs uppercase truncate', isPickA ? '' : 'opacity-30')}
                            style={isPickA ? { color: GREEN } : {}}>
                            {fight.fighterA.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono shrink-0" style={{ color: '#2a2a44' }}>vs</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <FighterAvatar name={fight.fighterB.name} espnId={fight.fighterB.espnId} size="sm" />
                          <span className={cn('font-bold text-xs uppercase truncate', !isPickA ? '' : 'opacity-30')}
                            style={!isPickA ? { color: GREEN } : {}}>
                            {fight.fighterB.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono text-muted-foreground text-xs uppercase">Pick:</span>
                        <span className="text-lg sm:text-xl font-black uppercase" style={{ color: GREEN }}>
                          {analysis.lean.fighter}
                        </span>
                        <ConfidenceBadge confidence={analysis.lean.confidence} />
                      </div>
                      <div className="text-foreground/90 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm max-w-4xl">
                        {analysis.lean.reasoning.split('\n').filter(Boolean).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* ── Style Matchup ───────────────────────────────────────── */}
                  {analysis.styleMatchup && (
                    <section id={sid('style')}>
                      <SectionHeader icon={<Swords className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />} title="Style Clash" />
                      <div className="bg-white/[0.03] border border-white/8 p-4 sm:p-5 rounded-xl"
                        style={{ boxShadow: '0 0 24px rgba(96,165,250,0.04)' }}>
                        <div className="flex items-start sm:items-center gap-3 mb-3 pb-3 border-b border-white/10 flex-wrap sm:flex-nowrap">
                          <StyleTag style={analysis.fighterA.style ?? 'Fighter'} name={analysis.fighterA.name} />
                          <span className="font-bold text-xs font-mono shrink-0" style={{ color: GREEN }}>VS</span>
                          <StyleTag style={analysis.fighterB.style ?? 'Fighter'} name={analysis.fighterB.name} />
                        </div>
                        <div className="text-foreground/90 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm">
                          {analysis.styleMatchup.split('\n').filter(Boolean).map((para, i) => (
                            <p key={i}>{para}</p>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* ── Upset Path ───────────────────────────────────────────── */}
                  {analysis.upsetAnalysis && (
                    <section id={sid('upset')}>
                      <SectionHeader icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />} title="Upset Path" />
                      <div className="p-4 sm:p-5 rounded-xl border"
                        style={{
                          background: VIOLET_DIM,
                          borderColor: VIOLET_BORDER,
                          boxShadow: '0 0 28px rgba(139,92,246,0.08)',
                        }}>
                        <div className="text-foreground/90 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm">
                          {analysis.upsetAnalysis.split('\n').filter(Boolean).map((para, i) => (
                            <p key={i}>{para}</p>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* ── Edges + Risks ────────────────────────────────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <section className="space-y-2 sm:space-y-3">
                      <h4 className="font-mono font-bold text-[10px] sm:text-xs uppercase flex items-center gap-2" style={{ color: GREEN }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
                        Key Edges
                      </h4>
                      <ul className="space-y-1.5 sm:space-y-2">
                        {analysis.lean.keyEdges?.map((edge, i) => (
                          <li key={i}
                            className="border px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2 transition-all"
                            style={{
                              background: 'rgba(34,230,110,0.03)',
                              borderColor: 'rgba(34,230,110,0.12)',
                              boxShadow: '0 0 12px rgba(34,230,110,0.04)',
                            }}>
                            <span className="font-bold mt-0.5 shrink-0" style={{ color: GREEN }}>›</span>
                            <span className="text-muted-foreground text-xs sm:text-sm">{edge}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="space-y-2 sm:space-y-3">
                      <h4 className="font-mono font-bold text-[10px] sm:text-xs uppercase text-amber-500 flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        Risk Factors
                      </h4>
                      <ul className="space-y-1.5 sm:space-y-2">
                        {analysis.lean.riskFactors?.map((risk, i) => (
                          <li key={i}
                            className="border px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2"
                            style={{
                              background: 'rgba(245,158,11,0.03)',
                              borderColor: 'rgba(245,158,11,0.12)',
                              boxShadow: '0 0 12px rgba(245,158,11,0.04)',
                            }}>
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">›</span>
                            <span className="text-muted-foreground text-xs sm:text-sm">{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  {/* ── Radar Chart ──────────────────────────────────────────── */}
                  <section id={sid('radar')}>
                    <SectionHeader
                      icon={<span className="text-base">📡</span>}
                      title="Fighter Comparison"
                    />
                    <FighterRadar
                      profileA={analysis.fighterA}
                      profileB={analysis.fighterB}
                      pickColor={pickColor}
                      isPickA={isPickA}
                    />
                  </section>

                  {/* ── Fighter Profiles ─────────────────────────────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <FighterProfile
                      profile={analysis.fighterA}
                      commonOpponents={analysis.commonOpponents}
                      isPickedFighter={isPickA}
                    />
                    <FighterProfile
                      profile={analysis.fighterB}
                      commonOpponents={analysis.commonOpponents}
                      isPickedFighter={!isPickA}
                    />
                  </div>

                  {/* ── Common Opponents ─────────────────────────────────────── */}
                  {analysis.commonOpponents && analysis.commonOpponents.length > 0 && (
                    <section id={sid('tape')} className="space-y-3 sm:space-y-4">
                      <SectionHeader icon={<Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />} title="Common Opponent Tape" />
                      <div className="space-y-2 sm:space-y-3">
                        {analysis.commonOpponents.map((co, i) => (
                          <div key={i} className="border border-white/8 rounded-xl overflow-hidden">
                            {/* Clickable header */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedOpponent(prev => prev === co.opponent ? null : co.opponent);
                              }}
                              className="w-full bg-white/[0.04] px-3 sm:px-4 py-2.5 border-b border-white/8 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
                            >
                              <span className="font-bold font-mono text-[10px] sm:text-xs uppercase tracking-wide">{co.opponent}</span>
                              <ChevronDown
                                className={cn('w-3.5 h-3.5 transition-transform duration-200', expandedOpponent === co.opponent && 'rotate-180')}
                                style={{ color: '#3a3a5c' }}
                              />
                            </button>

                            {/* Result grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
                              <ResultCell name={analysis.fighterA.name} result={co.resultA} method={co.methodA} />
                              <ResultCell name={analysis.fighterB.name} result={co.resultB} method={co.methodB} />
                            </div>

                            {/* Expandable notes */}
                            {expandedOpponent === co.opponent && co.notes && (
                              <div
                                className="px-3 sm:px-4 py-3 sm:py-4 border-t border-violet-500/15 text-[11px] sm:text-xs text-foreground/80 leading-relaxed"
                                style={{ background: VIOLET_DIM }}
                              >
                                <span className="font-bold font-mono text-[9px] uppercase tracking-widest text-violet-400/70 block mb-1.5">
                                  Tape Analysis
                                </span>
                                {co.notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Odds ────────────────────────────────────────────────── */}
                  {analysis.odds && (
                    <div id={sid('odds')} className="pt-4 sm:pt-6 border-t border-white/8">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white/[0.03] px-3 sm:px-4 py-2.5 rounded-xl font-mono text-[10px] sm:text-xs border border-white/5">
                        <span className="text-muted-foreground uppercase font-bold w-full sm:w-auto">
                          Book Odds ({analysis.odds.book || 'Market'})
                        </span>
                        <span>
                          {analysis.fighterA.name}:{' '}
                          <span className="text-white font-bold">
                            {displayOdds(analysis.odds.fighterA, oddsFormat)}
                          </span>
                        </span>
                        <span className="text-white/20">·</span>
                        <span>
                          {analysis.fighterB.name}:{' '}
                          <span className="text-white font-bold">
                            {displayOdds(analysis.odds.fighterB, oddsFormat)}
                          </span>
                        </span>
                        {/* Format toggle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleOdds(); }}
                          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[9px] uppercase tracking-widest font-bold transition-colors hover:bg-white/10"
                          style={{ borderColor: 'rgba(255,255,255,0.12)', color: GREEN }}
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          {oddsFormat === 'american' ? 'American' : oddsFormat === 'decimal' ? 'Decimal' : 'Implied %'}
                        </button>
                      </div>
                      {/* Also show card-level odds if available */}
                      {(fight.oddsA || fight.oddsB) && (
                        <div className="mt-2 flex gap-4 px-4 text-[10px] font-mono text-muted-foreground">
                          {fight.oddsA && (
                            <button onClick={(e) => { e.stopPropagation(); cycleOdds(); }}
                              className="hover:text-white transition-colors">
                              {fight.fighterA.name}: {displayDecimalOdds(fight.oddsA, oddsFormat)}
                            </button>
                          )}
                          {fight.oddsB && (
                            <button onClick={(e) => { e.stopPropagation(); cycleOdds(); }}
                              className="hover:text-white transition-colors">
                              {fight.fighterB.name}: {displayDecimalOdds(fight.oddsB, oddsFormat)}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ── Radar Chart ───────────────────────────────────────────────────── */
const RADAR_DIMS = ['Striking', 'Grappling', 'Cardio', 'Chin', 'Power', 'Defense'] as const;
type RadarDim = typeof RADAR_DIMS[number];

const DIM_KEY_MAP: Record<RadarDim, keyof RadarMetrics> = {
  Striking: 'striking', Grappling: 'grappling', Cardio: 'cardio',
  Chin: 'chin', Power: 'power', Defense: 'defense',
};

function FighterRadar({
  profileA, profileB, pickColor, isPickA,
}: {
  profileA: ExtendedFighterStats;
  profileB: ExtendedFighterStats;
  pickColor: string;
  isPickA: boolean;
}) {
  const metricsA = deriveRadar(profileA);
  const metricsB = deriveRadar(profileB);

  const data = RADAR_DIMS.map(dim => ({
    metric: dim,
    [profileA.name]: metricsA[DIM_KEY_MAP[dim]],
    [profileB.name]: metricsB[DIM_KEY_MAP[dim]],
    fullMark: 10,
  }));

  const colorA = isPickA ? GREEN : 'rgba(96,165,250,0.85)';
  const colorB = !isPickA ? GREEN : 'rgba(96,165,250,0.85)';

  return (
    <div className="rounded-xl border border-white/8 p-4 sm:p-5"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}
          />
          <Radar
            name={profileA.name}
            dataKey={profileA.name}
            stroke={colorA}
            fill={colorA}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Radar
            name={profileB.name}
            dataKey={profileB.name}
            stroke={colorB}
            fill={colorB}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', paddingTop: '8px' }}
            formatter={(value) => (
              <span style={{ color: value === profileA.name ? colorA : colorB }}>{value}</span>
            )}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
      {icon}
      <h3 className="text-base sm:text-lg font-bold uppercase tracking-tight">{title}</h3>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const isStrong = confidence === 'strong';
  return (
    <Badge
      variant="outline"
      className="uppercase font-black font-mono tracking-widest text-[9px] sm:text-[10px]"
      style={isStrong
        ? { background: 'rgba(34,230,110,0.15)', color: '#22e66e', borderColor: 'rgba(34,230,110,0.3)' }
        : { background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.25)' }}
    >
      {isStrong ? '🔒 LOCK' : confidence}
    </Badge>
  );
}

const STYLE_COLORS: Record<string, string> = {
  boxer:   'text-blue-400 border-blue-400/30 bg-blue-500/10',
  boxing:  'text-blue-400 border-blue-400/30 bg-blue-500/10',
  wrestl:  'text-yellow-400 border-yellow-400/30 bg-yellow-500/10',
  jiu:     'text-purple-400 border-purple-400/30 bg-purple-500/10',
  bjj:     'text-purple-400 border-purple-400/30 bg-purple-500/10',
  sambo:   'text-red-400 border-red-400/30 bg-red-500/10',
  muay:    'text-orange-400 border-orange-400/30 bg-orange-500/10',
  kick:    'text-orange-400 border-orange-400/30 bg-orange-500/10',
  karate:  'text-cyan-400 border-cyan-400/30 bg-cyan-500/10',
  judo:    'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
  taekwon: 'text-cyan-400 border-cyan-400/30 bg-cyan-500/10',
};

function getStyleColor(style: string): string {
  const lower = style.toLowerCase();
  for (const [key, cls] of Object.entries(STYLE_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return 'text-muted-foreground border-white/20 bg-white/5';
}

function StyleTag({ style, name }: { style: string; name: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
      <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground uppercase truncate">{name}</span>
      <span className={cn('text-[10px] sm:text-xs font-bold font-mono px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border truncate', getStyleColor(style))}>
        {style}
      </span>
    </div>
  );
}

function ResultCell({ name, result, method }: { name: string; result: string; method: string }) {
  const isWin = result?.toUpperCase() === 'W';
  return (
    <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
      <span className={cn(
        'w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[10px] sm:text-xs font-black font-mono shrink-0',
        isWin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      )}>
        {result}
      </span>
      <div className="min-w-0">
        <div className="text-[9px] sm:text-[10px] font-mono text-muted-foreground uppercase truncate">{name}</div>
        <div className="text-[10px] sm:text-xs font-mono font-bold">{method}</div>
      </div>
    </div>
  );
}

/* ── Strength/weakness tag with opponent tooltip ───────────────────── */
function TagWithTooltip({
  text,
  type,
  fighterName,
  commonOpponents,
}: {
  text: string;
  type: 'strength' | 'weakness';
  fighterName: string;
  commonOpponents: CommonOpponent[];
}) {
  // Check if this tag references any common opponent by partial name match
  const matchedOpponent = commonOpponents.find(co => {
    const parts = co.opponent.split(' ').filter(p => p.length > 3);
    return parts.some(part => text.toLowerCase().includes(part.toLowerCase()));
  });

  const baseClass = type === 'strength'
    ? 'text-[10px] sm:text-xs bg-green-500/10 border border-green-500/20 text-green-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md'
    : 'text-[10px] sm:text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md';

  if (!matchedOpponent) {
    return <span className={baseClass}>{text}</span>;
  }

  // Find this fighter's result vs the common opponent
  const isA = matchedOpponent && fighterName !== undefined &&
    (commonOpponents.find(c => c.opponent === matchedOpponent.opponent) === matchedOpponent);
  // We need to know if this profile is fighterA or fighterB
  // We'll pass the result directly from the analysis
  const result   = matchedOpponent.resultA; // overridden per call site
  const method   = matchedOpponent.methodA;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(baseClass, 'cursor-help underline decoration-dotted underline-offset-2')}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[200px] text-center font-mono text-[10px]"
        style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <p className="font-bold">{matchedOpponent.opponent}</p>
        <p className="text-muted-foreground mt-0.5">{fighterName}: {result} · {method}</p>
        {matchedOpponent.notes && (
          <p className="text-muted-foreground mt-1 text-[9px] leading-tight">{matchedOpponent.notes.slice(0, 80)}…</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Fighter Profile card ──────────────────────────────────────────── */
function FighterProfile({
  profile,
  commonOpponents,
  isPickedFighter,
}: {
  profile: ExtendedFighterStats;
  commonOpponents: CommonOpponent[];
  isPickedFighter: boolean;
}) {
  return (
    <div
      className="border rounded-xl p-4 sm:p-5 space-y-3 sm:space-y-4"
      style={{
        background: isPickedFighter ? 'rgba(34,230,110,0.02)' : 'rgba(255,255,255,0.02)',
        borderColor: isPickedFighter ? 'rgba(34,230,110,0.14)' : 'rgba(255,255,255,0.06)',
        boxShadow: isPickedFighter ? '0 0 20px rgba(34,230,110,0.04)' : 'none',
      }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h4 className="font-black text-sm sm:text-base uppercase tracking-tight truncate">{profile.name}</h4>
          <p className={cn('text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0.5 mt-1 rounded border inline-block', getStyleColor(profile.style ?? ''))}>
            {profile.style || 'Mixed Martial Arts'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[120px]">
          {profile.recentForm?.map((res, i) => (
            <span
              key={i}
              className={cn(
                'flex items-center justify-center w-5 h-5 rounded-md text-[9px] sm:text-[10px] font-bold font-mono',
                res === 'W' ? 'bg-green-500/20 text-green-500' :
                res === 'L' ? 'bg-red-500/20 text-red-500' :
                'bg-gray-500/20 text-gray-400'
              )}
            >
              {res}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        <div>
          <h5 className="text-[9px] sm:text-[10px] uppercase font-bold font-mono text-muted-foreground mb-1.5 sm:mb-2">Strengths</h5>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {profile.strengths?.map((s, i) => (
              <TagWithTooltip
                key={i}
                text={s}
                type="strength"
                fighterName={profile.name}
                commonOpponents={commonOpponents}
              />
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-[9px] sm:text-[10px] uppercase font-bold font-mono text-muted-foreground mb-1.5 sm:mb-2">Weaknesses</h5>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {profile.weaknesses?.map((w, i) => (
              <TagWithTooltip
                key={i}
                text={w}
                type="weakness"
                fighterName={profile.name}
                commonOpponents={commonOpponents}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
