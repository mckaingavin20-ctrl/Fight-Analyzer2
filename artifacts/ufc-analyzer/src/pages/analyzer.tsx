import { useState, useEffect } from 'react';
import { useListEvents, useGetEventCard, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Swords, Calendar, MapPin, Loader2, Brain } from 'lucide-react';
import { FightRow } from '@/components/fight-row';
import { Skeleton } from '@/components/ui/skeleton';

export default function Analyzer() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: events, isLoading: isLoadingEvents } = useListEvents();

  useEffect(() => {
    if (events && events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const { data: eventCard, isLoading: isLoadingCard } = useGetEventCard(selectedEventId, {
    query: {
      enabled: !!selectedEventId,
      queryKey: getGetEventCardQueryKey(selectedEventId),
    }
  });

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Top banner */}
      <div className="bg-amber-950/40 border-b border-amber-800/30 text-amber-200/80 py-2 px-4 flex items-start sm:items-center justify-center gap-2 text-xs font-mono">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
        <span>MMA is highly unpredictable. This is AI-generated analysis for informational purposes only — not financial advice.</span>
      </div>

      {/* Hero header */}
      <div className="border-b border-white/5 bg-black/30">
        <div className="max-w-5xl mx-auto px-4 py-5 sm:py-8">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3 mb-3 sm:mb-1">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Swords className="w-5 h-5 sm:w-7 sm:h-7 text-primary shrink-0" />
              <h1 className="text-lg sm:text-3xl font-black uppercase tracking-tight truncate">
                UFC Card Analyzer
              </h1>
            </div>
            {/* Replit AI badge — desktop only, shown inline with title */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase shrink-0">
              <Brain className="w-3.5 h-3.5 text-primary" />
              Replit AI
            </div>
          </div>

          <p className="text-muted-foreground text-xs pl-7 sm:pl-10 mb-4 sm:mb-5">
            AI-powered fight scouting · style clashes · common-opponent tape · confident picks
          </p>

          {/* Event selector row */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Replit AI badge — mobile, shown left of select */}
            <div className="flex sm:hidden items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase shrink-0">
              <Brain className="w-3 h-3 text-primary" />
              Replit AI
            </div>
            <Select
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              disabled={isLoadingEvents}
            >
              <SelectTrigger className="flex-1 sm:w-[320px] sm:flex-none bg-card border-card-border text-sm">
                {isLoadingEvents ? (
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  <SelectValue placeholder="Select an event" />
                )}
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    <span className="font-medium">{event.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* Loading skeleton */}
        {isLoadingCard && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Loading fight card…</span>
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-lg p-4 space-y-3">
                <Skeleton className="h-3 w-20 bg-white/5" />
                <Skeleton className="h-6 w-2/3 bg-white/5" />
                <Skeleton className="h-3 w-1/3 bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {/* Event card */}
        {!isLoadingCard && eventCard && (
          <div>
            {/* Event meta */}
            <div className="mb-5 pb-4 border-b border-white/8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-xl font-black uppercase tracking-tight">{eventCard.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono text-muted-foreground mt-1">
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
                <div className="text-xs font-mono text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-md self-start sm:self-auto whitespace-nowrap">
                  {eventCard.fights.length} fights · tap to scout
                </div>
              </div>
            </div>

            {/* Fight rows */}
            <div className="space-y-2 sm:space-y-3">
              {eventCard.fights.map((fight) => (
                <FightRow key={fight.id} fight={fight} />
              ))}
            </div>

            <p className="text-center text-xs font-mono text-muted-foreground/50 mt-8 pb-6">
              Analysis powered by Replit AI · Odds from The Odds API · Refreshed daily at 06:00 UTC
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoadingCard && !isLoadingEvents && !eventCard && events && events.length === 0 && (
          <div className="text-center py-24 text-muted-foreground font-mono">
            <Swords className="w-10 h-10 mx-auto mb-4 text-white/10" />
            <p>No upcoming UFC events found.</p>
            <p className="text-xs mt-2">Check back closer to the next event.</p>
          </div>
        )}
      </main>
    </div>
  );
}
