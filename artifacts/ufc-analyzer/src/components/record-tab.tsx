import { useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PicksRecord } from '@workspace/api-client-react/src/generated/api.schemas';

const GOLD      = '#f59e0b';
const WIN_COLOR = '#4ade80';
const LOSS_COLOR = '#f87171';

type Filter = 'all' | 'correct' | 'wrong' | 'pending';

export function RecordTab({ record }: { record: PicksRecord | undefined }) {
  const [filter, setFilter] = useState<Filter>('all');

  if (!record) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />)}
      </div>
    );
  }

  const wins    = record.wins;
  const losses  = record.losses;
  const pending = record.pending;
  const pct     = record.pct;
  const resolved = wins + losses;

  const allPicks = [...record.picks].sort(
    (a, b) => new Date(b.pickedAt).getTime() - new Date(a.pickedAt).getTime()
  );

  const filtered = allPicks.filter(p => {
    if (filter === 'correct') return p.result === 'win';
    if (filter === 'wrong')   return p.result === 'loss';
    if (filter === 'pending') return p.result === 'pending';
    return true;
  });

  const filterBtns: { id: Filter; label: string; count: number; color: string }[] = [
    { id: 'all',     label: 'All',     count: allPicks.length, color: 'rgba(255,255,255,0.5)' },
    { id: 'correct', label: 'Correct', count: wins,    color: WIN_COLOR },
    { id: 'wrong',   label: 'Wrong',   count: losses,  color: LOSS_COLOR },
    { id: 'pending', label: 'Pending', count: pending, color: 'rgba(255,255,255,0.3)' },
  ];

  return (
    <div className="space-y-5">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Wins"     value={wins}   color={WIN_COLOR} />
        <StatCard label="Losses"   value={losses} color={LOSS_COLOR} />
        <StatCard
          label="Accuracy"
          value={pct !== null ? `${pct}%` : '—'}
          color={pct === null ? 'rgba(255,255,255,0.3)' : pct >= 65 ? WIN_COLOR : pct >= 50 ? GOLD : LOSS_COLOR}
        />
      </div>

      {/* Sub-stats */}
      {resolved > 0 && (
        <div className="flex items-center gap-4 px-1 text-[11px] font-mono text-white/25">
          <span>{resolved} resolved</span>
          {pending > 0 && <><span className="text-white/15">·</span><span>{pending} pending</span></>}
        </div>
      )}

      {/* Filter tabs */}
      {allPicks.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {filterBtns.map(btn => (
            <button key={btn.id} onClick={() => setFilter(btn.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-bold border transition-all"
              style={filter === btn.id
                ? { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)', color: btn.color }
                : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
              }>
              {btn.label}
              <span className="text-[9px] opacity-60">{btn.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Pick list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-3xl mb-3">🎯</p>
          <p className="font-black uppercase tracking-tight text-white mb-2">
            {allPicks.length === 0 ? 'No Picks Yet' : `No ${filter} picks`}
          </p>
          <p className="text-xs font-mono text-white/30">
            {allPicks.length === 0
              ? 'Picks are locked in when you open a fight analysis.'
              : `Switch filter to see other picks.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((pick) => {
            const isWin     = pick.result === 'win';
            const isLoss    = pick.result === 'loss';
            const isPending = pick.result === 'pending';
            const date      = new Date(pick.eventDate ?? pick.pickedAt);
            const dateStr   = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

            return (
              <div key={pick.fightId}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
                style={{
                  background: isWin  ? 'rgba(74,222,128,0.04)' : isLoss ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.02)',
                  borderColor: isWin ? 'rgba(74,222,128,0.18)'  : isLoss ? 'rgba(248,113,113,0.18)'  : 'rgba(255,255,255,0.07)',
                }}>
                {/* Icon */}
                <div className="shrink-0">
                  {isWin     && <CheckCircle2 className="w-5 h-5" style={{ color: WIN_COLOR }} />}
                  {isLoss    && <XCircle      className="w-5 h-5" style={{ color: LOSS_COLOR }} />}
                  {isPending && <Clock        className="w-5 h-5 text-white/20" />}
                </div>

                {/* Pick info */}
                <div className="flex-1 min-w-0">
                  <p className="font-black uppercase text-sm leading-tight truncate"
                    style={{ color: isWin ? WIN_COLOR : isLoss ? LOSS_COLOR : 'rgba(255,255,255,0.8)' }}>
                    {pick.fighterPicked}
                  </p>
                  <p className="text-[10px] font-mono text-white/25 mt-0.5 truncate">vs {pick.opponent}</p>
                </div>

                {/* Confidence */}
                {pick.confidence && (
                  <div className="shrink-0 hidden sm:block">
                    <span className="text-[9px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded border"
                      style={pick.confidence === 'strong'
                        ? { color: GOLD, borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)' }
                        : { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }
                      }>
                      {pick.confidence === 'strong' ? '🔒' : '≈'} {pick.confidence}
                    </span>
                  </div>
                )}

                {/* Date + status */}
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-mono text-white/20">{dateStr}</p>
                  <p className={cn('text-[9px] font-mono font-black uppercase tracking-widest mt-0.5')}
                    style={{ color: isWin ? WIN_COLOR : isLoss ? LOSS_COLOR : 'rgba(255,255,255,0.2)' }}>
                    {isWin ? 'CORRECT' : isLoss ? 'WRONG' : 'PENDING'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/25">{label}</span>
      <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color }}>{value}</span>
    </div>
  );
}
