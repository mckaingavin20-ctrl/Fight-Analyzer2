import { useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PicksRecord } from '@workspace/api-client-react';

const RED        = '#E11D48';
const GOLD       = '#F59E0B';
const WIN_COLOR  = '#22C55E';
const LOSS_COLOR = '#EF4444';

type Filter = 'all' | 'correct' | 'wrong' | 'pending';

export function RecordTab({ record }: { record: PicksRecord | undefined }) {
  const [filter, setFilter] = useState<Filter>('all');

  if (!record) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/[0.03] animate-pulse border" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />)}
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

  const filterBtns: { id: Filter; label: string; count: number }[] = [
    { id: 'all',     label: 'All',     count: allPicks.length },
    { id: 'correct', label: 'Correct', count: wins },
    { id: 'wrong',   label: 'Wrong',   count: losses },
    { id: 'pending', label: 'Pending', count: pending },
  ];

  return (
    <div className="space-y-5">

      {/* Broadcast scoreboard */}
      <div className="border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ background: RED, borderColor: 'rgba(0,0,0,0.2)' }}>
          <div className="w-1 h-4 bg-white/40" />
          <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
            Gavin's Picks™ — Season Record
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ background: '#111113' }}>
          <ScoreBlock label="Wins" value={wins} color={WIN_COLOR} />
          <ScoreBlock label="Losses" value={losses} color={LOSS_COLOR} />
          <ScoreBlock
            label="Accuracy"
            value={pct !== null ? `${pct}%` : '—'}
            color={pct === null ? 'rgba(255,255,255,0.3)' : pct >= 65 ? WIN_COLOR : pct >= 50 ? GOLD : LOSS_COLOR}
          />
        </div>
        {resolved > 0 && (
          <div className="px-4 py-2 border-t flex items-center gap-4" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0D0D0F' }}>
            <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{resolved} resolved</span>
            {pending > 0 && <>
              <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{pending} pending</span>
            </>}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      {allPicks.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {filterBtns.map(btn => (
            <button key={btn.id} onClick={() => setFilter(btn.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 border transition-all text-xs font-black uppercase"
              style={filter === btn.id
                ? { background: RED, borderColor: RED, color: '#fff', fontFamily: 'var(--app-font-display)', fontSize: '11px', letterSpacing: '0.08em' }
                : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--app-font-display)', fontSize: '11px', letterSpacing: '0.08em' }
              }>
              {btn.label}
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', opacity: 0.6 }}>{btn.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Pick list */}
      {filtered.length === 0 ? (
        <div className="border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '24px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.08)', marginBottom: '8px' }}>
            {allPicks.length === 0 ? 'No Picks Yet' : `No ${filter} picks`}
          </p>
          <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
            {allPicks.length === 0
              ? 'Picks lock in when you open a fight analysis.'
              : 'Switch filter to see other picks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((pick) => {
            const isWin     = pick.result === 'win';
            const isLoss    = pick.result === 'loss';
            const isPending = pick.result === 'pending';
            const date      = new Date(pick.eventDate ?? pick.pickedAt);
            const dateStr   = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

            return (
              <div key={pick.fightId}
                className="flex items-center gap-3 px-4 py-3.5 border transition-all"
                style={{
                  background: isWin ? 'rgba(34,197,94,0.04)' : isLoss ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  borderColor: isWin ? 'rgba(34,197,94,0.15)' : isLoss ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                }}>

                {/* Result icon */}
                <div className="shrink-0 w-8 h-8 flex items-center justify-center border"
                  style={{
                    background: isWin ? 'rgba(34,197,94,0.1)' : isLoss ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                    borderColor: isWin ? 'rgba(34,197,94,0.2)' : isLoss ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                  }}>
                  {isWin     && <CheckCircle2 className="w-4 h-4" style={{ color: WIN_COLOR }} />}
                  {isLoss    && <XCircle      className="w-4 h-4" style={{ color: LOSS_COLOR }} />}
                  {isPending && <Clock        className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.2)' }} />}
                </div>

                {/* Pick info */}
                <div className="flex-1 min-w-0">
                  <p style={{
                    fontFamily: 'var(--app-font-display)',
                    fontWeight: 800,
                    fontSize: '15px',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    lineHeight: 1.1,
                    color: isWin ? WIN_COLOR : isLoss ? LOSS_COLOR : 'rgba(250,250,250,0.85)',
                  }}>
                    {pick.fighterPicked}
                  </p>
                  <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
                    vs {pick.opponent}
                  </p>
                </div>

                {/* Confidence */}
                {pick.confidence && (
                  <div className="shrink-0 hidden sm:block">
                    <span className="px-2 py-0.5 border"
                      style={pick.confidence === 'strong'
                        ? { color: GOLD, borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }
                        : { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.08)', background: 'transparent', fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }
                      }>
                      {pick.confidence === 'strong' ? '🔒 LOCK' : pick.confidence}
                    </span>
                  </div>
                )}

                {/* Date + status */}
                <div className="shrink-0 text-right">
                  <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{dateStr}</p>
                  <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px', color: isWin ? WIN_COLOR : isLoss ? LOSS_COLOR : 'rgba(255,255,255,0.15)' }}>
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

function ScoreBlock({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '40px', lineHeight: 1, color }}>{value}</span>
      <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{label}</span>
    </div>
  );
}
