import { useState } from 'react';
import { useGetFightAnalysis, getGetFightAnalysisQueryKey } from '@workspace/api-client-react';
import type { FightCard, FightAnalysis, FighterStats } from '@workspace/api-client-react/src/generated/api.schemas';
import { ChevronDown, ChevronUp, AlertCircle, ShieldAlert, Target, Scale, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function FightRow({ fight }: { fight: FightCard }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: analysis, isLoading, isError } = useGetFightAnalysis(fight.id, {
    query: {
      enabled: !!fight.id,
      queryKey: getGetFightAnalysisQueryKey(fight.id)
    }
  });

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden transition-all duration-200">
      {/* Header - Always visible */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
              {fight.order === 1 && fight.isMain ? "Main Event" : fight.weightClass}
            </span>
            {isLoading && <Skeleton className="h-4 w-24 bg-white/10" />}
          </div>
          <div className="flex items-center gap-4 text-xl md:text-2xl font-black font-sans uppercase tracking-tight">
            <span>{fight.fighterA.name}</span>
            <span className="text-primary text-sm">VS</span>
            <span>{fight.fighterB.name}</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground mt-1">
            <span>{fight.fighterA.record}</span>
            <span className="opacity-50">/</span>
            <span>{fight.fighterB.record}</span>
          </div>
        </div>

        {/* Status / Lean Badge */}
        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
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
              <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground">System Lean</span>
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

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-card-border bg-black/20">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-1/3 bg-white/5" />
              <Skeleton className="h-24 w-full bg-white/5" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-48 w-full bg-white/5" />
                <Skeleton className="h-48 w-full bg-white/5" />
              </div>
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-muted-foreground font-mono">
              Failed to load analysis for this fight.
            </div>
          ) : analysis ? (
            <div className="p-6 space-y-8 text-sm">
              
              {/* Lean & Reasoning */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <Target className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold uppercase tracking-tight">The Verdict</h3>
                </div>
                <div className="bg-white/5 border border-white/10 p-5 rounded-md space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground text-xs uppercase">Pick:</span>
                    <span className="text-xl font-bold">{analysis.lean.fighter}</span>
                    <ConfidenceBadge confidence={analysis.lean.confidence} />
                  </div>
                  <p className="text-foreground/90 leading-relaxed max-w-4xl">
                    {analysis.lean.reasoning}
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Key Edges */}
                <section className="space-y-3">
                  <h4 className="font-mono font-bold text-xs uppercase text-primary flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    Key Edges
                  </h4>
                  <ul className="space-y-2">
                    {analysis.lean.keyEdges?.map((edge, i) => (
                      <li key={i} className="bg-white/[0.03] border border-white/5 p-3 rounded-sm flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span className="text-muted-foreground">{edge}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Risk Factors */}
                <section className="space-y-3">
                  <h4 className="font-mono font-bold text-xs uppercase text-amber-500 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Risk Factors
                  </h4>
                  <ul className="space-y-2">
                    {analysis.lean.riskFactors?.map((risk, i) => (
                      <li key={i} className="bg-white/[0.03] border border-white/5 p-3 rounded-sm flex items-start gap-2">
                        <span className="text-amber-500 font-bold mt-0.5">•</span>
                        <span className="text-muted-foreground">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* Stats Comparison Table */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <Scale className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold uppercase tracking-tight">Tale of the Tape</h3>
                </div>
                
                <div className="overflow-x-auto border border-white/10 rounded-md">
                  <table className="w-full text-center font-mono text-xs">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-muted-foreground">
                        <th className="py-3 px-4 font-bold uppercase w-1/3">{analysis.fighterA.name}</th>
                        <th className="py-3 px-4 font-bold uppercase w-1/3">Stat</th>
                        <th className="py-3 px-4 font-bold uppercase w-1/3">{analysis.fighterB.name}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <StatRow 
                        label="Age" 
                        valA={analysis.fighterA.age} 
                        valB={analysis.fighterB.age} 
                        lowerIsBetter={true} 
                      />
                      <StatRow 
                        label="Height" 
                        valA={analysis.fighterA.height} 
                        valB={analysis.fighterB.height} 
                        isString 
                      />
                      <StatRow 
                        label="Reach" 
                        valA={analysis.fighterA.reach} 
                        valB={analysis.fighterB.reach} 
                        isString 
                      />
                      <StatRow 
                        label="SLpM" 
                        valA={analysis.fighterA.slpm} 
                        valB={analysis.fighterB.slpm} 
                      />
                      <StatRow 
                        label="Str Acc" 
                        valA={analysis.fighterA.strAcc} 
                        valB={analysis.fighterB.strAcc} 
                        isPercent
                      />
                      <StatRow 
                        label="Str Def" 
                        valA={analysis.fighterA.strDef} 
                        valB={analysis.fighterB.strDef} 
                        isPercent
                      />
                      <StatRow 
                        label="TD Avg" 
                        valA={analysis.fighterA.tdAvg} 
                        valB={analysis.fighterB.tdAvg} 
                      />
                      <StatRow 
                        label="TD Def" 
                        valA={analysis.fighterA.tdDef} 
                        valB={analysis.fighterB.tdDef} 
                        isPercent
                      />
                      <StatRow 
                        label="Sub Avg" 
                        valA={analysis.fighterA.subAvg} 
                        valB={analysis.fighterB.subAvg} 
                      />
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Fighter Profiles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FighterProfile profile={analysis.fighterA} />
                <FighterProfile profile={analysis.fighterB} />
              </div>

              {/* Common Opponents (if any) */}
              {analysis.commonOpponents && analysis.commonOpponents.length > 0 && (
                <section className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-tight text-muted-foreground border-b border-white/10 pb-2">
                    Common Opponents
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs border border-white/10 rounded-md">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10 text-muted-foreground">
                          <th className="py-2 px-3">Opponent</th>
                          <th className="py-2 px-3">{analysis.fighterA.name} Result</th>
                          <th className="py-2 px-3">{analysis.fighterB.name} Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {analysis.commonOpponents.map((co, i) => (
                          <tr key={i} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-3 font-bold">{co.opponent}</td>
                            <td className="py-2 px-3">
                              <span className={cn("mr-2 font-bold", co.resultA === 'W' ? 'text-green-500' : 'text-red-500')}>
                                {co.resultA}
                              </span>
                              <span className="text-muted-foreground">{co.methodA}</span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={cn("mr-2 font-bold", co.resultB === 'W' ? 'text-green-500' : 'text-red-500')}>
                                {co.resultB}
                              </span>
                              <span className="text-muted-foreground">{co.methodB}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Odds & Sources Footer */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-white/10">
                {analysis.odds && (
                  <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-md font-mono text-xs">
                    <span className="text-muted-foreground uppercase font-bold">Odds ({analysis.odds.book || 'Market Avg'})</span>
                    <div className="flex gap-4">
                      <span>{analysis.fighterA.name}: <span className="text-foreground">{analysis.odds.fighterA}</span></span>
                      <span>{analysis.fighterB.name}: <span className="text-foreground">{analysis.odds.fighterB}</span></span>
                    </div>
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

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map = {
    'strong': 'bg-green-500/20 text-green-400 border-green-500/30',
    'lean': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'toss-up': 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };
  const classes = map[confidence as keyof typeof map] || map['toss-up'];
  
  return (
    <Badge variant="outline" className={cn("uppercase font-bold font-mono tracking-widest", classes)}>
      {confidence}
    </Badge>
  );
}

function FighterProfile({ profile }: { profile: FighterStats }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-md p-5 space-y-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-bold text-lg uppercase tracking-tight">{profile.name}</h4>
          <p className="text-muted-foreground font-mono text-xs">{profile.style || 'Mixed Martial Arts'} • {profile.stance || 'Orthodox'}</p>
        </div>
        <div className="flex gap-1">
          {profile.recentForm?.map((res, i) => (
            <span 
              key={i} 
              className={cn(
                "flex items-center justify-center w-5 h-5 rounded-[2px] text-[10px] font-bold font-mono",
                res === 'W' ? "bg-green-500/20 text-green-500" : 
                res === 'L' ? "bg-red-500/20 text-red-500" : 
                "bg-gray-500/20 text-gray-400"
              )}
            >
              {res}
            </span>
          ))}
        </div>
      </div>
      
      <div className="space-y-3 pt-2">
        <div>
          <h5 className="text-[10px] uppercase font-bold font-mono text-muted-foreground mb-1">Strengths</h5>
          <div className="flex flex-wrap gap-2">
            {profile.strengths?.map((s, i) => (
              <span key={i} className="text-xs bg-white/10 px-2 py-1 rounded-sm text-foreground/90">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-[10px] uppercase font-bold font-mono text-muted-foreground mb-1">Weaknesses</h5>
          <div className="flex flex-wrap gap-2">
            {profile.weaknesses?.map((w, i) => (
              <span key={i} className="text-xs bg-black/40 px-2 py-1 rounded-sm text-foreground/80">{w}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ 
  label, valA, valB, isString = false, isPercent = false, lowerIsBetter = false 
}: { 
  label: string, 
  valA: number | string | null | undefined, 
  valB: number | string | null | undefined,
  isString?: boolean,
  isPercent?: boolean,
  lowerIsBetter?: boolean
}) {
  const displayA = valA == null ? '-' : isPercent ? `${valA}%` : valA;
  const displayB = valB == null ? '-' : isPercent ? `${valB}%` : valB;

  let aWins = false;
  let bWins = false;

  if (!isString && valA != null && valB != null) {
    const numA = Number(valA);
    const numB = Number(valB);
    if (numA !== numB) {
      if (lowerIsBetter) {
        aWins = numA < numB;
        bWins = numB < numA;
      } else {
        aWins = numA > numB;
        bWins = numB > numA;
      }
    }
  }

  return (
    <tr className="hover:bg-white/[0.02]">
      <td className={cn("py-2.5 px-4 text-left", aWins ? "text-primary font-bold" : "text-muted-foreground")}>{displayA}</td>
      <td className="py-2.5 px-4 text-muted-foreground/60 uppercase tracking-widest text-[10px] font-bold">{label}</td>
      <td className={cn("py-2.5 px-4 text-right", bWins ? "text-primary font-bold" : "text-muted-foreground")}>{displayB}</td>
    </tr>
  );
}