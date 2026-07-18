import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PicksRecord } from '@workspace/api-client-react/src/generated/api.schemas';

const GREEN = '#22e66e';

export function RecordTab({ record }: { record: PicksRecord | undefined }) {
  if (!record) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  const wins    = record.wins;
  const losses  = record.losses;
  const pending = record.pending;
  const pct     = record.pct;
  const resolved = wins + losses;

  const sortedPicks = [...record.picks].sort(
    (a, b) => new Date(b.pickedAt).getTime() - new Date(a.pickedAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Wins" value={wins} color={GREEN} />
        <StatCard label="Losses" value={losses} color="#f87171" />
        <StatCard
          label="Accuracy"
          value={pct !== null ? `${pct}%` : '—'}
          color={pct === null ? 'rgba(255,255,255,0.3)' : pct >= 60 ? GREEN : pct >= 50 ? '#fbbf24' : '#f87171'}
        />
      </div>

      {/* Sub-stats row */}
      {resolved > 0 && (
        <div className="flex items-center gap-4 px-1 text-[11px] font-mono text-white/30">
          <span>{resolved} resolved picks</span>
          {pending > 0 && <><span className="text-white/15">·</span><span>{pending} pending</span></>}
        </div>
      )}

      {/* Pick list */}
      {sortedPicks.length === 0 ? (
        <div className="rounded-2xl border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-3xl mb-3">🎯</p>
          <p className="font-black uppercase tracking-tight text-white mb-2">No Picks Yet</p>
          <p className="text-xs font-mono text-white/30">Picks are locked in when you open a fight analysis.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPicks.map((pick) => {
            const isWin     = pick.result === 'win';
            const isLoss    = pick.result === 'loss';
            const isPending = pick.result === 'pending';
            const date = new Date(pick.eventDate ?? pick.pickedAt);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <div
                key={pick.fightId}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all"
                style={{
                  background: isWin ? 'rgba(34,230,110,0.04)' : isLoss ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.02)',
                  borderColor: isWin ? 'rgba(34,230,110,0.16)' : isLoss ? 'rgba(248,113,113,0.16)' : 'rgba(255,255,255,0.07)',
                }}
              >
                {/* Result icon */}
                <div className="shrink-0">
                  {isWin    && <CheckCircle2 className="w-5 h-5" style={{ color: GREEN }} />}
                  {isLoss   && <XCircle      className="w-5 h-5 text-red-400" />}
                  {isPending && <Clock       className="w-5 h-5 text-white/25" />}
                </div>

                {/* Pick info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-black uppercase text-sm leading-tight truncate"
                    style={{ color: isWin ? GREEN : isLoss ? '#f87171' : 'rgba(255,255,255,0.8)' }}
                  >
                    {pick.fighterPicked}
                  </p>
                  <p className="text-[10px] font-mono text-white/30 mt-0.5 truncate">
                    over {pick.opponent}
                  </p>
                </div>

                {/* Date + status */}
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-mono text-white/25">{dateStr}</p>
                  <p className={cn(
                    'text-[9px] font-mono font-black uppercase tracking-widest mt-0.5',
                    isWin ? '' : isLoss ? 'text-red-400/70' : 'text-white/20'
                  )} style={isWin ? { color: GREEN } : {}}>
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
    <div
      className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">{label}</span>
      <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color }}>{value}</span>
    </div>
  );
}
