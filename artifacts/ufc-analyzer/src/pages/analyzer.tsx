import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { useListEvents, useGetEventCard, useGetRecord, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Loader2, LogOut, User } from 'lucide-react';
import { FightRow } from '@/components/fight-row';
import { Skeleton } from '@/components/ui/skeleton';

const GREEN = '#22e66e';

export default function Analyzer() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data: events, isLoading: isLoadingEvents } = useListEvents();
  const { data: record } = useGetRecord({ query: { staleTime: 1000 * 60 * 5 } });

  // Auto-select first event with odds, then first event overall
  useEffect(() => {
    if (!events?.length || selectedEventId) return;
    const withOdds = events.find(e => e.hasOdds);
    setSelectedEventId((withOdds ?? events[0]).id);
  }, [events, selectedEventId]);

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const { data: eventCard, isLoading: isLoadingCard } = useGetEventCard(selectedEventId, {
    query: {
      enabled: !!selectedEventId && !!selectedEvent?.hasOdds,
      queryKey: getGetEventCardQueryKey(selectedEventId),
      staleTime: 1000 * 60 * 5,
    },
  });

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: 'linear-gradient(180deg, #07070f 0%, #0a0a14 100%)' }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b px-4 sm:px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(7,7,15,0.9)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.06)' }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-xs"
            style={{ background: 'rgba(34,230,110,0.12)', color: GREEN, border: '1px solid rgba(34,230,110,0.25)' }}>
            GP
          </div>
          <span className="font-black uppercase tracking-widest text-sm text-white hidden sm:block">
            Gavin's <span style={{ color: GREEN }}>Picks™</span>
          </span>
        </div>

        {/* Right: record + live + user */}
        <div className="flex items-center gap-3">
          {/* W-L Record badge */}
          {record && (record.wins > 0 || record.losses > 0) && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-[11px]"
              style={{ background: 'rgba(34,230,110,0.05)', borderColor: 'rgba(34,230,110,0.2)' }}
            >
              <span style={{ color: GREEN }} className="font-black">
                {record.wins}W–{record.losses}L
              </span>
              {record.pct !== null && (
                <>
                  <span className="text-white/30">·</span>
                  <span
                    className="font-bold"
                    style={{ color: record.pct >= 60 ? GREEN : record.pct >= 50 ? '#fbbf24' : '#f87171' }}
                  >
                    {record.pct}%
                  </span>
                </>
              )}
            </div>
          )}

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-green-400/70 hidden sm:block">
              Live Odds
            </span>
          </div>

          {/* User menu */}
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{ background: 'rgba(34,230,110,0.15)', color: GREEN }}>
                  {(user.firstName?.[0] ?? user.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase()}
                </div>
                <span className="text-[10px] font-mono text-white/40 hidden sm:block max-w-[100px] truncate">
                  {user.firstName ?? user.emailAddresses?.[0]?.emailAddress?.split('@')[0]}
                </span>
              </div>
              <button
                onClick={() => signOut({ redirectUrl: basePath || '/' })}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Event selector */}
        {isLoadingEvents ? (
          <Skeleton className="h-14 w-full bg-white/5 rounded-xl" />
        ) : (
          <div className="rounded-xl border p-4 sm:p-5 space-y-3"
            style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger
                className="w-full font-mono font-bold text-sm border-0 bg-transparent p-0 h-auto focus:ring-0 shadow-none"
                style={{ color: GREEN }}
              >
                <SelectValue placeholder="Select an event…" />
              </SelectTrigger>
              <SelectContent style={{ background: '#0f0f1e', borderColor: 'rgba(255,255,255,0.1)' }}>
                {events?.map(ev => (
                  <SelectItem key={ev.id} value={ev.id}
                    className="font-mono font-bold text-sm cursor-pointer focus:bg-white/5">
                    <span>{ev.name}</span>
                    {!ev.hasOdds && (
                      <span className="ml-2 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border"
                        style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}>
                        Odds TBD
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEvent && (
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-muted-foreground">
                {selectedEvent.date && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                {selectedEvent.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    {selectedEvent.location}
                  </span>
                )}
                {!selectedEvent.hasOdds && (
                  <span className="px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest"
                    style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}>
                    Odds not yet available
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fight cards */}
        {!selectedEvent?.hasOdds ? (
          <div className="rounded-2xl border p-12 text-center"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <p className="text-2xl mb-3">🥊</p>
            <p className="font-black uppercase tracking-tight text-white mb-2">Card Not Announced Yet</p>
            <p className="text-xs font-mono text-muted-foreground">
              Odds will appear here once the card is officially announced and lines open.
            </p>
          </div>
        ) : isLoadingCard ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full bg-white/5 rounded-2xl" />
            ))}
          </div>
        ) : eventCard?.fights?.length ? (
          <div className="space-y-3">
            {eventCard.fights.map(fight => (
              <FightRow key={fight.id} fight={fight} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border p-12 text-center"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <p className="font-mono text-muted-foreground">No fights found for this event.</p>
          </div>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t px-4 sm:px-6 py-5 text-center"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <p className="text-[10px] font-mono text-white/20">
          © {new Date().getFullYear()} Gavin's Picks™ · For entertainment purposes only · Please gamble responsibly
        </p>
      </footer>
    </div>
  );
}
