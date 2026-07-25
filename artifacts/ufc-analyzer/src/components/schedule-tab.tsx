import { MapPin, ChevronRight, Zap } from 'lucide-react';

const RED  = '#E11D48';
const GOLD = '#F59E0B';

interface UfcEvent { id: string; name: string; date: string; venue?: string | null; location?: string | null; hasOdds?: boolean; }

export function ScheduleTab({ events, isLoading, onSelectEvent }: {
  events: UfcEvent[] | undefined;
  isLoading: boolean;
  onSelectEvent: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white/[0.03] animate-pulse border" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />)}
      </div>
    );
  }
  if (!events?.length) {
    return (
      <div className="border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>No upcoming events found.</p>
      </div>
    );
  }

  const now = new Date();
  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-1">
      <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: '16px' }}>
        Upcoming UFC events — tap to open card
      </p>
      {sorted.map((ev) => {
        const date     = new Date(ev.date);
        const isToday  = date.toDateString() === now.toDateString();
        const isPast   = date < now && !isToday;
        const hasOdds  = ev.hasOdds;
        const isMain   = /\bUFC\s+\d+\b/i.test(ev.name);
        const month    = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
        const day      = date.getDate();

        return (
          <button key={ev.id} onClick={() => onSelectEvent(ev.id)}
            className="w-full flex items-center gap-4 px-4 py-4 border text-left transition-all group hover:border-white/15 active:scale-[0.99]"
            style={{
              background: hasOdds ? 'rgba(225,29,72,0.04)' : isPast ? 'transparent' : 'rgba(255,255,255,0.02)',
              borderColor: hasOdds ? 'rgba(225,29,72,0.2)' : isMain ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
              opacity: isPast ? 0.3 : 1,
            }}>

            {/* Date block */}
            <div className="w-11 flex flex-col items-center justify-center py-2 shrink-0 border"
              style={{
                background: hasOdds ? 'rgba(225,29,72,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: hasOdds ? 'rgba(225,29,72,0.2)' : 'rgba(255,255,255,0.07)',
              }}>
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: hasOdds ? RED : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{month}</span>
              <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '22px', lineHeight: 1, color: hasOdds ? RED : 'white' }}>{day}</span>
            </div>

            {/* Event info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p style={{ fontFamily: 'var(--app-font-display)', fontWeight: isMain ? 800 : 700, fontSize: '14px', letterSpacing: '0.04em', textTransform: 'uppercase', color: isMain ? '#FAFAFA' : 'rgba(250,250,250,0.8)' }}>
                  {ev.name}
                </p>
                {hasOdds && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border"
                    style={{ background: 'rgba(225,29,72,0.1)', borderColor: 'rgba(225,29,72,0.2)', color: RED, fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                    <Zap className="w-2.5 h-2.5" /> Live Odds
                  </span>
                )}
                {!hasOdds && !isPast && (
                  <span className="px-2 py-0.5 border"
                    style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.15)', color: GOLD, fontFamily: 'var(--app-font-mono)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                    AI Available
                  </span>
                )}
              </div>
              {(ev.venue || ev.location) && (
                <p className="flex items-center gap-1 mt-1 truncate" style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  {[ev.venue, ev.location].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <ChevronRight className="w-4 h-4 shrink-0 text-white/10 group-hover:text-white/30 transition-colors" />
          </button>
        );
      })}
    </div>
  );
}
