import { useState, useEffect } from 'react';
import { useListEvents, useGetEventCard, useGetRecord, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Loader2, ChevronDown } from 'lucide-react';
import { FightRow } from '@/components/fight-row';
import { Skeleton } from '@/components/ui/skeleton';

export default function Analyzer() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: events, isLoading: isLoadingEvents } = useListEvents();
  const { data: record } = useGetRecord({ query: { staleTime: 1000 * 60 * 5 } });

  useEffect(() => {
    if (events && events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const { data: eventCard, isLoading: isLoadingCard } = useGetEventCard(selectedEventId, {
    query: {
      enabled: !!selectedEventId,
      queryKey: getGetEventCardQueryKey(selectedEventId),
      staleTime: 1000 * 60 * 5,
    }
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">

      {/* ── Header ───────────────────────────────────────────────── */}
      <header
        className="border-b border-white/5"
        style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, #0d0d1f 100%)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
          {/* Brand row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
                  GAVIN'S
                </span>
                <span
                  className="text-2xl sm:text-4xl font-black uppercase tracking-tight"
                  style={{ color: '#22e66e' }}
                >
                  PICKS
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-mono tracking-[0.2em] uppercase mt-1"
                style={{ color: '#3a3a5c' }}>
                UFC · FIGHT NIGHT ANALYSIS · OFFICIAL PICKS
              </p>
            </div>

            {/* Right side: record + live indicator */}
            <div className="flex items-center gap-3 self-start sm:self-auto">
              {/* W-L Record badge */}
              {record && (record.wins > 0 || record.losses > 0) && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-[11px]"
                  style={{ background: 'rgba(34,230,110,0.05)', borderColor: 'rgba(34,230,110,0.2)' }}
                >
                  <span style={{ color: '#22e66e' }} className="font-black">
                    {record.wins}W–{record.losses}L
                  </span>
                  {record.pct !== null && (
                    <span className="text-white/40">·</span>
                  )}
                  {record.pct !== null && (
                    <span
                      className="font-bold"
                      style={{ color: record.pct >= 60 ? '#22e66e' : record.pct >= 50 ? '#fbbf24' : '#f87171' }}
                    >
                      {record.pct}%
                    </span>
                  )}
                </div>
              )}

              {/* Live indicator */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-green-400/70">
                  Live Odds
                </span>
              </div>
            </div>
          </div>

          {/* Event selector */}
          <div className="relative">
            <Select
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              disabled={isLoadingEvents}
            >
              <SelectTrigger
                className="w-full sm:w-80 text-sm border-white/10 bg-white/5 backdrop-blur"
                style={{ borderRadius: '10px' }}
              >
                {isLoadingEvents ? (
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading events…
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <ChevronDown className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <SelectValue placeholder="Select an event" />
                  </div>
                )}
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <span className="font-semibold">{event.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {event.hasOdds === false && (
                      <span className="ml-2 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                        Odds TBD
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* Loading skeleton */}
        {isLoadingCard && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                Loading fight card…
              </span>
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
                <Skeleton className="h-3 w-20 bg-white/5" />
                <div className="flex justify-between gap-4">
                  <Skeleton className="h-20 w-20 rounded-full bg-white/5" />
                  <Skeleton className="h-20 w-20 rounded-full bg-white/5" />
                </div>
                <Skeleton className="h-4 w-1/2 mx-auto bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {/* Event card */}
        {!isLoadingCard && eventCard && (
          <div>
            {/* Event meta strip */}
            <div
              className="mb-5 rounded-xl px-4 py-3 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div>
                <h2 className="font-black uppercase tracking-tight text-sm sm:text-base">
                  {eventCard.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] font-mono text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(eventCard.date).toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                    })}
                  </span>
                  {(eventCard.venue || eventCard.location) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[eventCard.venue, eventCard.location].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg self-start sm:self-auto whitespace-nowrap border"
                style={{ color: '#22e66e', borderColor: 'rgba(34,230,110,0.2)', background: 'rgba(34,230,110,0.05)' }}
              >
                {eventCard.fights.length} fights on card
              </div>
            </div>

            {/* Fight cards */}
            {eventCard.fights.length === 0 ? (
              <div
                className="rounded-2xl border px-6 py-12 text-center font-mono"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div className="text-3xl mb-4">📋</div>
                <p className="font-bold uppercase tracking-widest text-sm mb-2">Card Not Announced Yet</p>
                <p className="text-xs text-muted-foreground/50 max-w-xs mx-auto">
                  The full fight card for this event hasn't been posted. Picks and odds will appear automatically once bookmakers open lines.
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {eventCard.fights.map((fight) => (
                  <FightRow key={fight.id} fight={fight} />
                ))}
              </div>
            )}

            <p className="text-center text-[10px] font-mono text-muted-foreground/30 mt-8 pb-6 uppercase tracking-widest">
              Picks by Gavin · Odds via The Odds API · Updated daily
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoadingCard && !isLoadingEvents && !eventCard && events && events.length === 0 && (
          <div className="text-center py-24 text-muted-foreground font-mono">
            <div className="text-4xl mb-4">🥊</div>
            <p className="font-bold uppercase tracking-widest">No upcoming events found.</p>
            <p className="text-xs mt-2 opacity-50">Check back closer to the next fight night.</p>
          </div>
        )}
      </main>
    </div>
  );
}
