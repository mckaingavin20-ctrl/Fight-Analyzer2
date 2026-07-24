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

/* ── Theme constants ────────────────────────────────────────────────── */
const GOLD         = '#f59e0b';
const GOLD_DIM     = 'rgba(245,158,11,0.1)';
const GOLD_BORDER  = 'rgba(245,158,11,0.28)';
const VIOLET       = '#7c3aed';
const VIOLET_DIM   = 'rgba(124,58,237,0.09)';
const VIOLET_BORDER = 'rgba(124,58,237,0.28)';
const WIN_COLOR    = '#22c55e';
const LOSS_COLOR   = '#ef4444';
const CARD_BG      = 'linear-gradient(180deg, #12111e 0%, #0d0c1a 100%)';

/* ── Odds helpers ──────────────────────────────────────────────────── */
type OddsFormat = 'american' | 'decimal' | 'probability';
function decimalToAmerican(d: number) { return d >= 2 ? `+${Math.round((d-1)*100)}` : `-${Math.round(100/(d-1))}`; }
function decimalToImplied(d: number) { return `${Math.round((1/d)*100)}%`; }
function formatOdds(decimal: number) { return decimalToAmerican(decimal); }
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
function displayDecimalOdds(d: number, format: OddsFormat): string {
  if (format === 'american') return decimalToAmerican(d);
  if (format === 'decimal') return d.toFixed(2);
  return decimalToImplied(d);
}

/* ── Radar derivation ──────────────────────────────────────────────── */
function deriveRadar(profile: ExtendedFighterStats): RadarMetrics {
  if (profile.radarMetrics) return profile.radarMetrics;
  const sw = (profile.strengths ?? []).join(' ').toLowerCase();
  const wk = (profile.weaknesses ?? []).join(' ').toLowerCase();
  const style = (profile.style ?? '').toLowerCase();
  const has = (t: string, kws: string[]) => kws.some(k => t.includes(k));
  let striking = 5;
  if (has(sw, ['striking','boxing','kick','punch','counter','combina','accurate','muay','karate','southpaw'])) striking += 2;
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
  if (has(wk, ['chin','hurt','knockdown','stopped','ko','tko','finished','wobbled','brittle'])) chin -= 2;
  let power = 5;
  if (has(sw, ['power','knockout','devastating','heavy hands','finish','one-punch','brutal','vicious'])) power += 2;
  if (has(wk, ['lacks power','no ko','power'])) power -= 2;
  let defense = 5;
  if (has(sw, ['defense','defensive','head movement','footwork','slipping','evasive','sprawl','takedown def'])) defense += 2;
  if (has(wk, ['defense','hittable','open to','leaks','wide','gets hit'])) defense -= 2;
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  return { striking: clamp(striking), grappling: clamp(grappling), cardio: clamp(cardio), chin: clamp(chin), power: clamp(power), defense: clamp(defense) };
}

/* ── Main component ────────────────────────────────────────────────── */
export function FightRow({ fight: rawFight }: { fight: FightCard }) {
  const fight = rawFight as ExtendedFightCard;
  const isCompleted = fight.pickResult === 'win' || fight.pickResult === 'loss';

  const [isExpanded, setIsExpanded]           = useState(false);
  const [oddsFormat, setOddsFormat]           = useState<OddsFormat>('american');
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);

  const { data: rawAnalysis, isLoading, isError } = useGetFightAnalysis(fight.id, {
    query: {
      enabled: !!fight.id && !isCompleted,
      queryKey: getGetFightAnalysisQueryKey(fight.id),
      staleTime: 1000 * 60 * 60,
    }
  });

  /* ── Completed fight card ──────────────────────────────────────────── */
  if (isCompleted) {
    const gpCorrect = fight.pickResult === 'win';
    const winner    = fight.pickWinner ?? '?';
    const isWinnerA = winner === fight.fighterA.name;
    return (
      <div className="rounded-2xl overflow-hidden border" style={{
        background: '#0e0d1b',
        borderColor: gpCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        opacity: 0.75,
      }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <span className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-white/20">
            {fight.isMain ? '★ MAIN · ' : ''}<span style={{ color: gpCorrect ? WIN_COLOR : LOSS_COLOR }}>FINAL</span>
          </span>
          <span className="text-[9px] font-mono font-black uppercase tracking-widest" style={{ color: gpCorrect ? WIN_COLOR : LOSS_COLOR }}>
            {gpCorrect ? '✓ Correct' : '✗ Wrong'}
          </span>
        </div>
        <div className="px-4 pb-2 pt-3 flex items-center gap-3">
          {[{ f: fight.fighterA, isWinner: isWinnerA }, { f: fight.fighterB, isWinner: !isWinnerA }].map(({ f, isWinner }, i) => (
            <div key={i} className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl px-2 ${isWinner ? 'bg-white/[0.05]' : ''}`}>
              <FighterAvatar name={f.name} espnId={f.espnId} size="md" />
              <p className="font-black uppercase text-[11px] leading-tight tracking-tight text-center">{f.name}</p>
              {isWinner && (
                <span className="text-[8px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: 'rgba(34,197,94,0.12)', color: WIN_COLOR }}>WINNER</span>
              )}
              {i === 0 && <span className="text-[9px] font-black font-mono" style={{ color: '#252535' }}>VS</span>}
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/20">GP Pick</span>
          <span className="text-[10px] font-black uppercase tracking-tight" style={{ color: gpCorrect ? WIN_COLOR : LOSS_COLOR }}>
            {fight.gpPick ?? '?'}
          </span>
        </div>
      </div>
    );
  }

  const analysis  = rawAnalysis as RichAnalysis | undefined;
  const pick      = analysis?.lean?.fighter;
  const isPickA   = pick === fight.fighterA.name;
  const pickColor = GOLD;

  const sid = (s: string) => `${fight.id}-${s}`;
  const scrollTo = (s: string) => document.getElementById(sid(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cycleOdds = () => setOddsFormat(f => f === 'american' ? 'decimal' : f === 'decimal' ? 'probability' : 'american');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-2xl overflow-hidden transition-all duration-200 border" style={{
        background: CARD_BG,
        borderColor: isExpanded ? VIOLET_BORDER : 'rgba(255,255,255,0.07)',
        boxShadow: isExpanded ? `0 0 28px ${VIOLET_DIM}` : 'none',
      }}>
        {/* Fight label strip */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase" style={{ color: fight.isMain ? GOLD : '#3a3a5c' }}>
            {fight.isMain ? '★ MAIN EVENT' : fight.weightClass || 'Prelim'}
          </span>
          {isLoading && (
            <span className="flex items-center gap-1 text-[9px] font-mono uppercase animate-pulse" style={{ color: VIOLET }}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Scouting…
            </span>
          )}
        </div>

        {/* Fighter matchup */}
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left px-4 pb-0 pt-3">
          <div className="flex items-stretch gap-3">
            {[
              { f: fight.fighterA, isP: isPickA },
              { f: fight.fighterB, isP: !isPickA },
            ].map(({ f, isP }, i) => (
              <div key={i} className={cn(
                'flex-1 flex flex-col items-center gap-2 pb-4 rounded-xl transition-all duration-200 px-2 pt-3',
                pick && isP ? 'bg-white/[0.04]' : 'bg-transparent'
              )}>
                {i === 0 && <div />}
                <div className="relative">
                  <FighterAvatar name={f.name} espnId={f.espnId} size="lg" />
                  {pick && isP && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#12111e] flex items-center justify-center"
                      style={{ background: GOLD }}>
                      <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-black uppercase text-xs sm:text-sm leading-tight tracking-tight">{f.name}</p>
                  {(fight.oddsA || fight.oddsB) && (
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: isP && pick ? GOLD : '#3a3a5c' }}>
                      {i === 0 && fight.oddsA ? formatOdds(fight.oddsA) : i === 1 && fight.oddsB ? formatOdds(fight.oddsB) : ''}
                    </p>
                  )}
                  {analysis && (
                    <p className="text-[10px] font-mono text-white/30 mt-0.5">
                      {i === 0 ? analysis.fighterA.style : analysis.fighterB.style}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* VS separator (injected into flex) */}
          {/* Pick bar */}
          <div className="mx-0 mt-0 rounded-b-xl px-4 py-2.5 flex items-center justify-between" style={{
            background: pick ? `linear-gradient(90deg, ${GOLD_DIM}, transparent)` : 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div className="flex items-center gap-2 min-w-0">
              {isLoading ? (
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest animate-pulse">Analyzing…</span>
              ) : isError ? (
                <div className="flex items-center gap-1 text-red-400 text-[10px] font-mono">
                  <AlertCircle className="w-3 h-3" /> Analysis failed
                </div>
              ) : pick ? (
                <>
                  <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-white/25">Gavin's Pick</span>
                  <span className="font-black text-xs sm:text-sm uppercase tracking-tight truncate" style={{ color: GOLD }}>{pick}</span>
                  {analysis && <ConfidenceBadge confidence={analysis.lean.confidence} />}
                </>
              ) : !analysis ? (
                <span className="text-[10px] font-mono text-white/20">Click to analyze</span>
              ) : null}
            </div>
            <div style={{ color: '#2a2a44' }}>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>

        {/* Expanded analysis panel */}
        {isExpanded && (
          <div className="border-t text-sm" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {isLoading ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-mono animate-pulse" style={{ color: VIOLET }}>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Deep scouting in progress… first analysis takes up to 30s.
                </div>
                <Skeleton className="h-5 w-1/3 bg-white/5" />
                <Skeleton className="h-28 w-full bg-white/5" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-40 bg-white/5" />
                  <Skeleton className="h-40 bg-white/5" />
                </div>
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-white/30 font-mono text-sm">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                Analysis unavailable. Try again in a moment.
              </div>
            ) : analysis ? (
              <>
                {/* Sticky anchor nav */}
                <nav className="sticky top-0 z-30 flex items-center gap-0 overflow-x-auto border-b"
                  style={{ background: '#0e0d1b', borderColor: 'rgba(255,255,255,0.06)' }}>
                  {[
                    { id: 'verdict', label: 'Overview' },
                    { id: 'style',   label: 'Style',  show: !!analysis.styleMatchup },
                    { id: 'upset',   label: 'Upset',  show: !!analysis.upsetAnalysis },
                    { id: 'radar',   label: 'Radar' },
                    { id: 'tape',    label: 'Tape',   show: (analysis.commonOpponents?.length ?? 0) > 0 },
                    { id: 'odds',    label: 'Odds',   show: !!analysis.odds },
                  ].filter(n => n.show !== false).map(nav => (
                    <button key={nav.id}
                      onClick={(e) => { e.stopPropagation(); scrollTo(nav.id); }}
                      className="px-3 sm:px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-widest whitespace-nowrap hover:text-white transition-colors"
                      style={{ color: '#3a3a5c' }}>
                      {nav.label}
                    </button>
                  ))}
                </nav>

                <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">

                  {/* Verdict */}
                  <section id={sid('verdict')}>
                    <SectionHeader icon={<Target className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: GOLD }} />} title="The Verdict" />
                    <div className="rounded-xl p-4 sm:p-5 space-y-3 border" style={{
                      background: GOLD_DIM,
                      borderColor: GOLD_BORDER,
                      boxShadow: `0 0 32px rgba(245,158,11,0.05)`,
                    }}>
                      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                        {[{ f: analysis.fighterA, isP: isPickA }, { f: analysis.fighterB, isP: !isPickA }].map(({ f, isP }, i) => (
                          <div key={i} className="flex items-center gap-2 min-w-0">
                            {i === 1 && <span className="text-[10px] font-mono text-white/20 shrink-0">vs</span>}
                            <FighterAvatar name={f.name} espnId={f.espnId} size="sm" />
                            <span className={cn('font-bold text-xs uppercase truncate', isP ? '' : 'opacity-30')}
                              style={isP ? { color: GOLD } : {}}>
                              {f.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono text-white/30 text-xs uppercase">Pick:</span>
                        <span className="text-lg sm:text-xl font-black uppercase" style={{ color: GOLD }}>{analysis.lean.fighter}</span>
                        <ConfidenceBadge confidence={analysis.lean.confidence} />
                      </div>
                      <div className="text-white/80 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm max-w-4xl">
                        {analysis.lean.reasoning.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    </div>
                  </section>

                  {/* Style Matchup */}
                  {analysis.styleMatchup && (
                    <section id={sid('style')}>
                      <SectionHeader icon={<Swords className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: VIOLET }} />} title="Style Clash" />
                      <div className="p-4 sm:p-5 rounded-xl border" style={{ background: VIOLET_DIM, borderColor: VIOLET_BORDER }}>
                        <div className="flex items-start sm:items-center gap-3 mb-3 pb-3 border-b border-white/10 flex-wrap sm:flex-nowrap">
                          <StyleTag style={analysis.fighterA.style ?? 'Fighter'} name={analysis.fighterA.name} />
                          <span className="font-bold text-xs font-mono shrink-0" style={{ color: VIOLET }}>VS</span>
                          <StyleTag style={analysis.fighterB.style ?? 'Fighter'} name={analysis.fighterB.name} />
                        </div>
                        <div className="text-white/80 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm">
                          {analysis.styleMatchup.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Upset Path */}
                  {analysis.upsetAnalysis && (
                    <section id={sid('upset')}>
                      <SectionHeader icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />} title="Upset Path" />
                      <div className="p-4 sm:p-5 rounded-xl border" style={{ background: VIOLET_DIM, borderColor: VIOLET_BORDER }}>
                        <div className="text-white/80 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm">
                          {analysis.upsetAnalysis.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Edges + Risks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <section className="space-y-2 sm:space-y-3">
                      <h4 className="font-mono font-bold text-[10px] sm:text-xs uppercase flex items-center gap-2" style={{ color: GOLD }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
                        Key Edges
                      </h4>
                      <ul className="space-y-1.5 sm:space-y-2">
                        {analysis.lean.keyEdges?.map((edge, i) => (
                          <li key={i} className="border px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2" style={{
                            background: GOLD_DIM, borderColor: GOLD_BORDER,
                          }}>
                            <span className="font-bold mt-0.5 shrink-0" style={{ color: GOLD }}>›</span>
                            <span className="text-white/70 text-xs sm:text-sm">{edge}</span>
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
                          <li key={i} className="border px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2" style={{
                            background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.15)',
                          }}>
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">›</span>
                            <span className="text-white/70 text-xs sm:text-sm">{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  {/* Radar */}
                  <section id={sid('radar')}>
                    <SectionHeader icon={<span className="text-base">📡</span>} title="Fighter Comparison" />
                    <FighterRadar profileA={analysis.fighterA} profileB={analysis.fighterB} isPickA={isPickA} />
                  </section>

                  {/* Fighter Profiles */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <FighterProfile profile={analysis.fighterA} commonOpponents={analysis.commonOpponents} isPickedFighter={isPickA} />
                    <FighterProfile profile={analysis.fighterB} commonOpponents={analysis.commonOpponents} isPickedFighter={!isPickA} />
                  </div>

                  {/* Common Opponents */}
                  {analysis.commonOpponents?.length > 0 && (
                    <section id={sid('tape')} className="space-y-3 sm:space-y-4">
                      <SectionHeader icon={<Users className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: VIOLET }} />} title="Common Opponent Tape" />
                      <div className="space-y-2 sm:space-y-3">
                        {analysis.commonOpponents.map((co, i) => (
                          <div key={i} className="border rounded-xl overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedOpponent(prev => prev === co.opponent ? null : co.opponent); }}
                              className="w-full px-3 sm:px-4 py-2.5 border-b flex items-center justify-between hover:bg-white/5 transition-colors"
                              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
                              <span className="font-bold font-mono text-[10px] sm:text-xs uppercase tracking-wide">{co.opponent}</span>
                              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200 text-white/20', expandedOpponent === co.opponent && 'rotate-180')} />
                            </button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
                              <ResultCell name={analysis.fighterA.name} result={co.resultA} method={co.methodA} />
                              <ResultCell name={analysis.fighterB.name} result={co.resultB} method={co.methodB} />
                            </div>
                            {expandedOpponent === co.opponent && co.notes && (
                              <div className="px-3 sm:px-4 py-3 sm:py-4 border-t text-[11px] sm:text-xs text-white/70 leading-relaxed"
                                style={{ background: VIOLET_DIM, borderColor: VIOLET_BORDER }}>
                                <span className="font-bold font-mono text-[9px] uppercase tracking-widest text-violet-400/70 block mb-1.5">Tape Analysis</span>
                                {co.notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Odds */}
                  {analysis.odds && (
                    <div id={sid('odds')} className="pt-4 sm:pt-6 border-t border-white/[0.06]">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 rounded-xl font-mono text-[10px] sm:text-xs border"
                        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                        <span className="text-white/30 uppercase font-bold w-full sm:w-auto">Book Odds ({analysis.odds.book || 'Market'})</span>
                        <span>{analysis.fighterA.name}: <span className="text-white font-bold">{displayOdds(analysis.odds.fighterA, oddsFormat)}</span></span>
                        <span className="text-white/20">·</span>
                        <span>{analysis.fighterB.name}: <span className="text-white font-bold">{displayOdds(analysis.odds.fighterB, oddsFormat)}</span></span>
                        <button onClick={(e) => { e.stopPropagation(); cycleOdds(); }}
                          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[9px] uppercase tracking-widest font-bold hover:bg-white/10 transition-colors"
                          style={{ borderColor: 'rgba(255,255,255,0.12)', color: VIOLET }}>
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
    </TooltipProvider>
  );
}

/* ── Radar Chart ───────────────────────────────────────────────────── */
const RADAR_DIMS = ['Striking','Grappling','Cardio','Chin','Power','Defense'] as const;
type RadarDim = typeof RADAR_DIMS[number];
const DIM_KEY_MAP: Record<RadarDim, keyof RadarMetrics> = {
  Striking:'striking', Grappling:'grappling', Cardio:'cardio', Chin:'chin', Power:'power', Defense:'defense',
};
function FighterRadar({ profileA, profileB, isPickA }: { profileA: ExtendedFighterStats; profileB: ExtendedFighterStats; isPickA: boolean }) {
  const metricsA = deriveRadar(profileA);
  const metricsB = deriveRadar(profileB);
  const data = RADAR_DIMS.map(dim => ({ metric: dim, [profileA.name]: metricsA[DIM_KEY_MAP[dim]], [profileB.name]: metricsB[DIM_KEY_MAP[dim]], fullMark: 10 }));
  const colorA = isPickA ? GOLD : 'rgba(124,58,237,0.85)';
  const colorB = !isPickA ? GOLD : 'rgba(124,58,237,0.85)';
  return (
    <div className="rounded-xl border border-white/[0.07] p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }} />
          <Radar name={profileA.name} dataKey={profileA.name} stroke={colorA} fill={colorA} fillOpacity={0.15} strokeWidth={2} />
          <Radar name={profileB.name} dataKey={profileB.name} stroke={colorB} fill={colorB} fillOpacity={0.15} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', paddingTop: '8px' }}
            formatter={(value) => <span style={{ color: value === profileA.name ? colorA : colorB }}>{value}</span>} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */
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
    <Badge variant="outline" className="uppercase font-black font-mono tracking-widest text-[9px] sm:text-[10px]"
      style={isStrong
        ? { background: 'rgba(245,158,11,0.15)', color: GOLD, borderColor: GOLD_BORDER }
        : { background: 'rgba(124,58,237,0.1)', color: '#a78bfa', borderColor: 'rgba(124,58,237,0.3)' }}>
      {isStrong ? '🔒 LOCK' : confidence}
    </Badge>
  );
}

const STYLE_COLORS: Record<string, string> = {
  boxer:'text-blue-400 border-blue-400/30 bg-blue-500/10', boxing:'text-blue-400 border-blue-400/30 bg-blue-500/10',
  wrestl:'text-yellow-400 border-yellow-400/30 bg-yellow-500/10',
  jiu:'text-purple-400 border-purple-400/30 bg-purple-500/10', bjj:'text-purple-400 border-purple-400/30 bg-purple-500/10',
  sambo:'text-red-400 border-red-400/30 bg-red-500/10',
  muay:'text-orange-400 border-orange-400/30 bg-orange-500/10', kick:'text-orange-400 border-orange-400/30 bg-orange-500/10',
  karate:'text-cyan-400 border-cyan-400/30 bg-cyan-500/10',
  judo:'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
};
function getStyleColor(style: string) {
  const lower = style.toLowerCase();
  for (const [key, cls] of Object.entries(STYLE_COLORS)) if (lower.includes(key)) return cls;
  return 'text-white/40 border-white/20 bg-white/5';
}
function StyleTag({ style, name }: { style: string; name: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
      <span className="text-[9px] sm:text-[10px] font-mono text-white/30 uppercase truncate">{name}</span>
      <span className={cn('text-[10px] sm:text-xs font-bold font-mono px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border truncate', getStyleColor(style))}>{style}</span>
    </div>
  );
}
function ResultCell({ name, result, method }: { name: string; result: string; method: string }) {
  const isWin = result?.toUpperCase() === 'W';
  return (
    <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
      <span className={cn('w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-[10px] sm:text-xs font-black font-mono shrink-0',
        isWin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
        {result}
      </span>
      <div className="min-w-0">
        <div className="text-[9px] sm:text-[10px] font-mono text-white/30 uppercase truncate">{name}</div>
        <div className="text-[10px] sm:text-xs font-mono font-bold">{method}</div>
      </div>
    </div>
  );
}
function FighterProfile({ profile, commonOpponents, isPickedFighter }: { profile: ExtendedFighterStats; commonOpponents: CommonOpponent[]; isPickedFighter: boolean }) {
  return (
    <div className="border rounded-xl p-4 sm:p-5 space-y-3 sm:space-y-4" style={{
      background: isPickedFighter ? GOLD_DIM : 'rgba(255,255,255,0.02)',
      borderColor: isPickedFighter ? GOLD_BORDER : 'rgba(255,255,255,0.07)',
      boxShadow: isPickedFighter ? `0 0 20px rgba(245,158,11,0.04)` : 'none',
    }}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h4 className="font-black text-sm sm:text-base uppercase tracking-tight truncate">{profile.name}</h4>
          <p className={cn('text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0.5 mt-1 rounded border inline-block', getStyleColor(profile.style ?? ''))}>
            {profile.style || 'Mixed Martial Arts'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[120px]">
          {profile.recentForm?.map((res, i) => (
            <span key={i} className={cn('flex items-center justify-center w-5 h-5 rounded-md text-[9px] sm:text-[10px] font-bold font-mono',
              res === 'W' ? 'bg-green-500/20 text-green-500' : res === 'L' ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-400')}>
              {res}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2 sm:space-y-3">
        {[{ label: 'Strengths', items: profile.strengths, type: 'strength' as const }, { label: 'Weaknesses', items: profile.weaknesses, type: 'weakness' as const }].map(({ label, items, type }) => (
          <div key={label}>
            <h5 className="text-[9px] sm:text-[10px] uppercase font-bold font-mono text-white/30 mb-1.5 sm:mb-2">{label}</h5>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {items?.map((s, i) => (
                <span key={i} className={cn('text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border',
                  type === 'strength' ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'
                )}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
