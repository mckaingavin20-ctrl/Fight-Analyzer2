import { useState, useEffect } from 'react';
import { useListEvents, useGetEventCard, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Swords, Calendar, MapPin, Loader2, Brain } from 'lucide-react';
import { FightRow } from '@/components/fight-row';
import { Skeleton } from '@/components/ui/skeleton';

export default function Analyzer() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: events, isLoading: isLoadingEvents } = useListEvents();

  // Auto-select the nearest upcoming event when events load
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
      <div className="bg-amber-950/40 border-b border-amber-800/30 text-amber-200/80 py-2 px-4 flex items-center justify-center gap-2 text-xs font-mono">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        MMA is highly unpredictable. This is AI-generated analysis for informational purposes only — not financial advice.
      </div>

      {/* Hero header */}
      <div className="border-b border-white/5 bg-black/30">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Swords className="w-7 h-7 text-primary" />
                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
                  UFC Card Analyzer
                </h1>
              </div>
              <p className="text-muted-foreground text-sm pl-10">
                AI-powered fight scouting · style clashes · common-opponent tape · confident picks
              </p>
            </div>

            {/* Event selector */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase">
                <Brain className="w-3.5 h-3.5 text-primary" />
                Replit AI
              </div>
              <Select
                value={selectedEventId}
                onValueChange={setSelectedEventId}
                disabled={isLoadingEvents}
              >
                <SelectTrigger className="w-full md:w-[320px] bg-card border-card-border">
                  {isLoadingEvents ? (
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading events…
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
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Loading skeleton while card fetches */}
        {isLoadingCard && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="font-mono text-sm text-muted-foreground uppercase">Loading fight card…</span>
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-lg p-5 space-y-3">
                <Skeleton className="h-4 w-24 bg-white/5" />
                <Skeleton className="h-7 w-2/3 bg-white/5" />
                <Skeleton className="h-4 w-1/3 bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {/* Event card */}
        {!isLoadingCard && eventCard && (
          <div>
            {/* Event meta */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-white/8">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">{eventCard.name}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground mt-1">
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
              <div className="text-xs font-mono text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-md">
                {eventCard.fights.length} fights · click any row to scout
              </div>
            </div>

            {/* Fight rows */}
            <div className="space-y-3">
              {eventCard.fights.map((fight) => (
                <FightRow key={fight.id} fight={fight} />
              ))}
            </div>

            <p className="text-center text-xs font-mono text-muted-foreground/50 mt-10 pb-6">
              Analysis powered by Replit AI · Odds sourced from The Odds API · Refreshed daily at 06:00 UTC
            </p>
          </div>
        )}

        {/* Empty state when no events load */}
        {!isLoadingCard && !isLoadingEvents && !eventCard && events && events.length === 0 && (
          <div className="text-center py-24 text-muted-foreground font-mono">
            <Swords className="w-10 h-10 mx-auto mb-4 text-white/10" />
            <p>No upcoming UFC events found with available odds.</p>
            <p className="text-xs mt-2">Check back closer to the next event.</p>
          </div>
        )}
      </main>
    </div>
  );
}
