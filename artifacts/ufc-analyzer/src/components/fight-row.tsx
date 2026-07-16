import { useState } from 'react';
import { useGetFightAnalysis, getGetFightAnalysisQueryKey } from '@workspace/api-client-react';
import type { FightCard, FighterStats } from '@workspace/api-client-react/src/generated/api.schemas';
import { ChevronDown, ChevronUp, AlertCircle, ShieldAlert, Target, Swords, Users, Loader2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FighterAvatar } from '@/components/fighter-avatar';
import { cn } from '@/lib/utils';

// Extended type to include espnId passed from backend
interface ExtendedFighterStats extends FighterStats {
  espnId?: string | null;
}
interface ExtendedFightCard extends FightCard {
  fighterA: ExtendedFighterStats;
  fighterB: ExtendedFighterStats;
}

interface RichAnalysis {
  fightId: string;
  weightClass: string;
  fighterA: ExtendedFighterStats;
  fighterB: ExtendedFighterStats;
  commonOpponents: Array<{
    opponent: string;
    resultA: string;
    methodA: string;
    resultB: string;
    methodB: string;
    notes?: string;
  }>;
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

const GREEN = '#22e66e';
const GREEN_DIM = 'rgba(34,230,110,0.12)';
const GREEN_BORDER = 'rgba(34,230,110,0.25)';

export function FightRow({ fight: rawFight }: { fight: FightCard }) {
  const fight = rawFight as ExtendedFightCard;
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: rawAnalysis, isLoading, isError } = useGetFightAnalysis(fight.id, {
    query: {
      enabled: !!fight.id,
      queryKey: getGetFightAnalysisQueryKey(fight.id),
      staleTime: 1000 * 60 * 60,
    }
  });

  const analysis = rawAnalysis as RichAnalysis | undefined;
  const pick = analysis?.lean?.fighter;
  const isPickA = pick === fight.fighterA.name;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200 border"
      style={{
        background: 'linear-gradient(180deg, #0f0f1e 0%, #0b0b18 100%)',
        borderColor: isExpanded ? GREEN_BORDER : 'rgba(255,255,255,0.06)',
        boxShadow: isExpanded ? `0 0 24px ${GREEN_DIM}` : 'none',
      }}
    >
      {/* ── Fight label strip ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase"
          style={{ color: fight.isMain ? GREEN : '#3a3a5c' }}>
          {fight.isMain ? '★ MAIN EVENT' : fight.weightClass || 'Prelim'}
        </span>
        {isLoading && (
          <span className="flex items-center gap-1 text-[9px] font-mono uppercase animate-pulse"
            style={{ color: GREEN }}>
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Scouting…
          </span>
        )}
      </div>

      {/* ── Fighter matchup card ────────────────────────────────────── */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-4 pb-0 pt-3"
      >
        {/* Two fighters */}
        <div className="flex items-stretch gap-3">
          {/* Fighter A */}
          <div className={cn(
            'flex-1 flex flex-col items-center gap-2 pb-4 rounded-xl transition-all duration-200 px-2 pt-3',
            pick && isPickA ? 'bg-white/[0.04]' : 'bg-transparent'
          )}>
            <div className="relative">
              <FighterAvatar
                name={fight.fighterA.name}
                espnId={fight.fighterA.espnId}
                size="lg"
              />
              {pick && isPickA && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0f0f1e] flex items-center justify-center"
                  style={{ background: GREEN }}>
                  <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="font-black uppercase text-xs sm:text-sm leading-tight tracking-tight">
                {fight.fighterA.name}
              </p>
              {fight.oddsA && (
                <p className="text-[11px] font-mono mt-0.5"
                  style={{ color: isPickA ? GREEN : '#3a3a5c' }}>
                  {formatOdds(fight.oddsA)}
                </p>
              )}
              {analysis && (
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5 opacity-60">
                  {analysis.fighterA.style}
                </p>
              )}
            </div>
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 py-4">
            <span className="text-[10px] font-black font-mono tracking-widest"
              style={{ color: '#2a2a44' }}>VS</span>
          </div>

          {/* Fighter B */}
          <div className={cn(
            'flex-1 flex flex-col items-center gap-2 pb-4 rounded-xl transition-all duration-200 px-2 pt-3',
            pick && !isPickA ? 'bg-white/[0.04]' : 'bg-transparent'
          )}>
            <div className="relative">
              <FighterAvatar
                name={fight.fighterB.name}
                espnId={fight.fighterB.espnId}
                size="lg"
              />
              {pick && !isPickA && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0f0f1e] flex items-center justify-center"
                  style={{ background: GREEN }}>
                  <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="font-black uppercase text-xs sm:text-sm leading-tight tracking-tight">
                {fight.fighterB.name}
              </p>
              {fight.oddsB && (
                <p className="text-[11px] font-mono mt-0.5"
                  style={{ color: !isPickA ? GREEN : '#3a3a5c' }}>
                  {formatOdds(fight.oddsB)}
                </p>
              )}
              {analysis && (
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5 opacity-60">
                  {analysis.fighterB.style}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Pick bar ─────────────────────────────────────────────── */}
        <div
          className="mx-0 mt-0 rounded-b-xl px-4 py-2.5 flex items-center justify-between"
          style={{
            background: pick ? `linear-gradient(90deg, ${GREEN_DIM}, transparent)` : 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isLoading ? (
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest animate-pulse">
                Analyzing…
              </span>
            ) : isError ? (
              <div className="flex items-center gap-1 text-destructive text-[10px] font-mono">
                <AlertCircle className="w-3 h-3" /> Error
              </div>
            ) : pick ? (
              <>
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em]"
                  style={{ color: '#3a3a5c' }}>
                  Gavin's Pick
                </span>
                <span className="font-black text-xs sm:text-sm uppercase tracking-tight truncate"
                  style={{ color: GREEN }}>
                  {pick}
                </span>
                {analysis && <ConfidenceBadge confidence={analysis.lean.confidence} />}
              </>
            ) : null}
          </div>
          <div style={{ color: '#2a2a44' }}>
            {isExpanded
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* ── Expanded analysis panel ─────────────────────────────────── */}
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
            <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">

              {/* Verdict */}
              <section>
                <SectionHeader icon={<Target className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: GREEN }} />} title="The Verdict" />
                <div className="rounded-xl p-4 sm:p-5 space-y-3 border"
                  style={{ background: 'rgba(34,230,110,0.03)', borderColor: GREEN_BORDER }}>
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

              {/* Style Matchup */}
              {analysis.styleMatchup && (
                <section>
                  <SectionHeader icon={<Swords className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />} title="Style Clash" />
                  <div className="bg-white/[0.03] border border-white/8 p-4 sm:p-5 rounded-xl">
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

              {/* Upset Path */}
              {analysis.upsetAnalysis && (
                <section>
                  <SectionHeader icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />} title="Upset Path" />
                  <div className="bg-violet-500/5 border border-violet-500/20 p-4 sm:p-5 rounded-xl">
                    <div className="text-foreground/90 leading-relaxed space-y-2 sm:space-y-3 text-xs sm:text-sm">
                      {analysis.upsetAnalysis.split('\n').filter(Boolean).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Edges + Risks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <section className="space-y-2 sm:space-y-3">
                  <h4 className="font-mono font-bold text-[10px] sm:text-xs uppercase flex items-center gap-2"
                    style={{ color: GREEN }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
                    Key Edges
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {analysis.lean.keyEdges?.map((edge, i) => (
                      <li key={i} className="bg-white/[0.03] border border-white/5 px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2">
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
                      <li key={i} className="bg-white/[0.03] border border-white/5 px-3 py-2 sm:p-3 rounded-lg flex items-start gap-2">
                        <span className="text-amber-500 font-bold mt-0.5 shrink-0">›</span>
                        <span className="text-muted-foreground text-xs sm:text-sm">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* Fighter Profiles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <FighterProfile profile={analysis.fighterA} />
                <FighterProfile profile={analysis.fighterB} />
              </div>

              {/* Common Opponents */}
              {analysis.commonOpponents && analysis.commonOpponents.length > 0 && (
                <section className="space-y-3 sm:space-y-4">
                  <SectionHeader icon={<Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />} title="Common Opponent Tape" />
                  <div className="space-y-2 sm:space-y-3">
                    {analysis.commonOpponents.map((co, i) => (
                      <div key={i} className="border border-white/8 rounded-xl overflow-hidden">
                        <div className="bg-white/[0.04] px-3 sm:px-4 py-2 border-b border-white/8">
                          <span className="font-bold font-mono text-[10px] sm:text-xs uppercase tracking-wide">{co.opponent}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
                          <ResultCell name={analysis.fighterA.name} result={co.resultA} method={co.methodA} />
                          <ResultCell name={analysis.fighterB.name} result={co.resultB} method={co.methodB} />
                        </div>
                        {co.notes && (
                          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-black/20 border-t border-white/5 text-[10px] sm:text-xs text-muted-foreground leading-relaxed italic">
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
                <div className="pt-4 sm:pt-6 border-t border-white/8">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white/[0.03] px-3 sm:px-4 py-2.5 rounded-xl font-mono text-[10px] sm:text-xs border border-white/5">
                    <span className="text-muted-foreground uppercase font-bold w-full sm:w-auto">
                      Book Odds ({analysis.odds.book || 'Market'})
                    </span>
                    <span>{analysis.fighterA.name}: <span className="text-white font-bold">{analysis.odds.fighterA}</span></span>
                    <span className="text-white/20">·</span>
                    <span>{analysis.fighterB.name}: <span className="text-white font-bold">{analysis.odds.fighterB}</span></span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatOdds(decimal: number): string {
  const american = decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
  return american;
}

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

function FighterProfile({ profile }: { profile: ExtendedFighterStats }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 sm:p-5 space-y-3 sm:space-y-4">
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
              <span key={i} className="text-[10px] sm:text-xs bg-green-500/10 border border-green-500/20 text-green-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-[9px] sm:text-[10px] uppercase font-bold font-mono text-muted-foreground mb-1.5 sm:mb-2">Weaknesses</h5>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {profile.weaknesses?.map((w, i) => (
              <span key={i} className="text-[10px] sm:text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">{w}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
