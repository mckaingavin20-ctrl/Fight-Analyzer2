import { MapPin, ChevronRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const GOLD   = '#f59e0b';
const VIOLET = '#7c3aed';

interface UfcEvent { id: string; name: string; date: string; venue?: string | null; location?: string | null; hasOdds?: boolean; }

export function ScheduleTab({ events, isLoading, onSelectEvent }: {
  events: UfcEvent[] | undefined;
  isLoading: boolean;
  onSelectEvent: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}
      </div>
    );
  }
  if (!events?.length) {
    return (
      <div className="rounded-2xl border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="font-mono text-white/30 text-sm">No upcoming events found.</p>
      </div>
    );
  }

  const now = new Date();
  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-mono text-white/20 px-1">Upcoming UFC events — click to open card</p>
      {sorted.map((ev) => {
        const date     = new Date(ev.date);
        const isToday  = date.toDateString() === now.toDateString();
        const isPast   = date < now && !isToday;
        const isLive   = ev.hasOdds;
        const isMain   = /\bUFC\s+\d+\b/i.test(ev.name);
        const month    = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const day      = date.getDate();
        const year     = date.getFullYear();

        return (
          <button key={ev.id} onClick={() => onSelectEvent(ev.id)}
            className={cn('w-full flex items-center gap-4 px-4 py-4 rounded-2xl border text-left transition-all group',
              isPast ? 'opacity-35' : 'hover:border-white/15 active:scale-[0.99]')}
            style={{
              background: isLive ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.02)',
              borderColor: isLive ? 'rgba(245,158,11,0.2)' : isMain ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
            }}>
            {/* Date block */}
            <div className="w-12 flex flex-col items-center justify-center rounded-xl py-2 shrink-0"
              style={{ background: isLive ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)' }}>
              <span className="text-[9px] font-mono font-black uppercase tracking-widest"
                style={{ color: isLive ? GOLD : 'rgba(255,255,255,0.3)' }}>{month}</span>
              <span className="text-xl font-black leading-none" style={{ color: isLive ? GOLD : 'white' }}>{day}</span>
              <span className="text-[8px] font-mono text-white/20">{year}</span>
            </div>

            {/* Event info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={cn('font-black text-sm uppercase tracking-tight leading-tight', isMain ? 'text-white' : 'text-white/80')}>
                  {ev.name}
                </p>
                {isLive && (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.14)', color: GOLD }}>
                    <Zap className="w-2.5 h-2.5" /> LIVE ODDS
                  </span>
                )}
                {!isLive && !isPast && (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(124,58,237,0.1)', color: VIOLET, border: '1px solid rgba(124,58,237,0.2)' }}>
                    AI Analysis Available
                  </span>
                )}
              </div>
              {(ev.venue || ev.location) && (
                <p className="text-[10px] font-mono text-white/20 mt-1 flex items-center gap-1 truncate">
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  {[ev.venue, ev.location].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
