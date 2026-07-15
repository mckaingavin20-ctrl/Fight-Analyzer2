import { useState } from 'react';
import { useGetFightAnalysis, getGetFightAnalysisQueryKey } from '@workspace/api-client-react';
import type { FightCard, FighterStats } from '@workspace/api-client-react/src/generated/api.schemas';
import { ChevronDown, ChevronUp, AlertCircle, ShieldAlert, Target, Swords, Users, ExternalLink, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// The API returns extra fields not in the base schema yet
interface RichAnalysis {
  fightId: string;
  weightClass: string;
  fighterA: FighterStats;
  fighterB: FighterStats;
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
  sources?: Array<{ label: string; url: string }>;
}

export function FightRow({ fight }: { fight: FightCard }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: rawAnalysis, isLoading, isError } = useGetFightAnalysis(fight.id, {
    query: {
      enabled: !!fight.id,
      queryKey: getGetFightAnalysisQueryKey(fight.id),
      // AI calls can take up to 30s on first load
      staleTime: 1000 * 60 * 60, // 1 hour
    }
  });

  const analysis = rawAnalysis as RichAnalysis | undefined;

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden transition-all duration-200">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
              {fight.isMain ? 'Main Event' : fight.weightClass}
            </span>
            {isLoading && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-primary/70 uppercase animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> AI Scouting…
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xl md:text-2xl font-black font-sans uppercase tracking-tight">
            <span className="truncate">{fight.fighterA.name}</span>
            <span className="text-primary text-sm shrink-0">VS</span>
            <span className="truncate">{fight.fighterB.name}</span>
          </div>
          {analysis && (
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground mt-1">
              <span className="truncate">{analysis.fighterA.style}</span>
              <span className="opacity-40">·</span>
              <span className="truncate">{analysis.fighterB.style}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto shrink-0">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary/50 animate-pulse" />
              <span className="text-xs font-mono text-muted-foreground uppercase">Analyzing</span>
            </div>
          ) : isError ? (
            <div className="text-destructive text-xs font-mono flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Error
            </div>
          ) : analysis ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground">Scout Pick</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{analysis.lean.fighter}</span>
                <ConfidenceBadge confidence={analysis.lean.confidence} />
              </div>
            </div>
          ) : null}

          <div className="text-muted-foreground">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {/* Expanded */}
      {isExpanded && (
        <div className="border-t border-card-border bg-black/20">
          {isLoading ? (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 text-primary/60 text-sm font-mono animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating deep scout analysis… this may take up to 30 seconds on first load.
              </div>
              <Skeleton className="h-6 w-1/3 bg-white/5" />
              <Skeleton className="h-32 w-full bg-white/5" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-48 w-full bg-white/5" />
                <Skeleton className="h-48 w-full bg-white/5" />
              </div>
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-muted-foreground font-mono text-sm">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" />
              Failed to generate analysis. The server may still be warming up — try again in a moment.
            </div>
          ) : analysis ? (
            <div className="p-6 space-y-8 text-sm">

              {/* Verdict */}
              <section>
                <SectionHeader icon={<Target className="w-5 h-5 text-primary" />} title="The Verdict" />
                <div className="bg-white/5 border border-white/10 p-5 rounded-md space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-muted-foreground text-xs uppercase">Pick:</span>
                    <span className="text-xl font-bold">{analysis.lean.fighter}</span>
                    <ConfidenceBadge confidence={analysis.lean.confidence} />
                  </div>
                  <div className="text-foreground/90 leading-relaxed space-y-3 max-w-4xl">
                    {analysis.lean.reasoning.split('\n').filter(Boolean).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              </section>

              {/* Style Matchup */}
              {analysis.styleMatchup && (
                <section>
                  <SectionHeader icon={<Swords className="w-5 h-5 text-primary" />} title="Style Clash" />
                  <div className="bg-white/5 border border-white/10 p-5 rounded-md">
                    <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/10">
                      <StyleTag style={analysis.fighterA.style ?? 'Fighter'} name={analysis.fighterA.name} />
                      <span className="text-primary font-bold text-xs font-mono">VS</span>
                      <StyleTag style={analysis.fighterB.style ?? 'Fighter'} name={analysis.fighterB.name} />
                    </div>
                    <div className="text-foreground/90 leading-relaxed space-y-3">
                      {analysis.styleMatchup.split('\n').filter(Boolean).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Edges + Risks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="space-y-3">
                  <h4 className="font-mono font-bold text-xs uppercase text-primary flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    Key Edges
                  </h4>
                  <ul className="space-y-2">
                    {analysis.lean.keyEdges?.map((edge, i) => (
                      <li key={i} className="bg-white/[0.03] border border-white/5 p-3 rounded-sm flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5 shrink-0">›</span>
                        <span className="text-muted-foreground">{edge}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="space-y-3">
                  <h4 className="font-mono font-bold text-xs uppercase text-amber-500 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Risk Factors
                  </h4>
                  <ul className="space-y-2">
                    {analysis.lean.riskFactors?.map((risk, i) => (
                      <li key={i} className="bg-white/[0.03] border border-white/5 p-3 rounded-sm flex items-start gap-2">
                        <span className="text-amber-500 font-bold mt-0.5 shrink-0">›</span>
                        <span className="text-muted-foreground">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* Fighter Profiles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FighterProfile profile={analysis.fighterA} />
                <FighterProfile profile={analysis.fighterB} />
              </div>

              {/* Common Opponents */}
              {analysis.commonOpponents && analysis.commonOpponents.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader icon={<Users className="w-5 h-5 text-primary" />} title="Common Opponent Tape" />
                  <div className="space-y-3">
                    {analysis.commonOpponents.map((co, i) => (
                      <div key={i} className="border border-white/10 rounded-md overflow-hidden">
                        <div className="bg-white/5 px-4 py-2 border-b border-white/10">
                          <span className="font-bold font-mono text-xs uppercase tracking-wide">{co.opponent}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
                          <ResultCell name={analysis.fighterA.name} result={co.resultA} method={co.methodA} />
                          <ResultCell name={analysis.fighterB.name} result={co.resultB} method={co.methodB} />
                        </div>
                        {co.notes && (
                          <div className="px-4 py-3 bg-black/20 border-t border-white/5 text-xs text-muted-foreground leading-relaxed italic">
                            {co.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Odds + Sources */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-white/10">
                {analysis.odds && (
                  <div className="flex flex-wrap items-center gap-4 bg-white/5 px-4 py-2 rounded-md font-mono text-xs">
                    <span className="text-muted-foreground uppercase font-bold">Book Odds ({analysis.odds.book || 'Market'})</span>
                    <span>{analysis.fighterA.name}: <span className="text-foreground font-bold">{analysis.odds.fighterA}</span></span>
                    <span>{analysis.fighterB.name}: <span className="text-foreground font-bold">{analysis.odds.fighterB}</span></span>
                  </div>
                )}
                {analysis.sources && analysis.sources.length > 0 && (
                  <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                    <span className="uppercase font-bold">Sources:</span>
                    {analysis.sources.map((src, i) => (
                      <a key={i} href={src.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                        {src.label} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      {icon}
      <h3 className="text-lg font-bold uppercase tracking-tight">{title}</h3>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, string> = {
    strong: 'bg-green-500/20 text-green-400 border-green-500/30',
    lean:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'toss-up': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  return (
    <Badge variant="outline" className={cn('uppercase font-bold font-mono tracking-widest', map[confidence] ?? map['toss-up'])}>
      {confidence}
    </Badge>
  );
}

const STYLE_COLORS: Record<string, string> = {
  boxer:    'text-blue-400 border-blue-400/30 bg-blue-500/10',
  boxing:   'text-blue-400 border-blue-400/30 bg-blue-500/10',
  wrestl:   'text-yellow-400 border-yellow-400/30 bg-yellow-500/10',
  jiu:      'text-purple-400 border-purple-400/30 bg-purple-500/10',
  bjj:      'text-purple-400 border-purple-400/30 bg-purple-500/10',
  sambo:    'text-red-400 border-red-400/30 bg-red-500/10',
  muay:     'text-orange-400 border-orange-400/30 bg-orange-500/10',
  kick:     'text-orange-400 border-orange-400/30 bg-orange-500/10',
  karate:   'text-cyan-400 border-cyan-400/30 bg-cyan-500/10',
  judo:     'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
  taekwon:  'text-cyan-400 border-cyan-400/30 bg-cyan-500/10',
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-muted-foreground uppercase">{name}</span>
      <span className={cn('text-xs font-bold font-mono px-2 py-1 rounded border', getStyleColor(style))}>
        {style}
      </span>
    </div>
  );
}

function ResultCell({ name, result, method }: { name: string; result: string; method: string }) {
  const isWin = result?.toUpperCase() === 'W';
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span className={cn('w-6 h-6 rounded-[2px] flex items-center justify-center text-xs font-black font-mono shrink-0',
        isWin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      )}>
        {result}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-mono text-muted-foreground uppercase truncate">{name}</div>
        <div className="text-xs font-mono font-bold">{method}</div>
      </div>
    </div>
  );
}

function FighterProfile({ profile }: { profile: FighterStats }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-md p-5 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-base uppercase tracking-tight">{profile.name}</h4>
          <p className={cn('text-xs font-mono font-bold px-2 py-0.5 mt-1 rounded border inline-block', getStyleColor(profile.style ?? ''))}>
            {profile.style || 'Mixed Martial Arts'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {profile.recentForm?.map((res, i) => (
            <span
              key={i}
              className={cn(
                'flex items-center justify-center w-5 h-5 rounded-[2px] text-[10px] font-bold font-mono',
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

      <div className="space-y-3">
        <div>
          <h5 className="text-[10px] uppercase font-bold font-mono text-muted-foreground mb-2">Strengths</h5>
          <div className="flex flex-wrap gap-2">
            {profile.strengths?.map((s, i) => (
              <span key={i} className="text-xs bg-green-500/10 border border-green-500/20 text-green-300 px-2 py-1 rounded-sm">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-[10px] uppercase font-bold font-mono text-muted-foreground mb-2">Weaknesses</h5>
          <div className="flex flex-wrap gap-2">
            {profile.weaknesses?.map((w, i) => (
              <span key={i} className="text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-2 py-1 rounded-sm">{w}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
