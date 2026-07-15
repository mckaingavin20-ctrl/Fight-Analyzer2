import { useState } from 'react';
import { useListEvents, useGetEventCard, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Swords } from 'lucide-react';
import { FightRow } from '@/components/fight-row';

export default function Analyzer() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [analyzingEventId, setAnalyzingEventId] = useState<string>('');

  const { data: events, isLoading: isLoadingEvents } = useListEvents();

  const { data: eventCard, isLoading: isAnalyzing } = useGetEventCard(analyzingEventId, {
    query: {
      enabled: !!analyzingEventId,
      queryKey: getGetEventCardQueryKey(analyzingEventId)
    }
  });

  const handleAnalyze = () => {
    if (selectedEventId) {
      setAnalyzingEventId(selectedEventId);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">
      {/* Disclaimer Banner */}
      <div className="bg-destructive/10 border-b border-destructive/20 text-destructive-foreground py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <span className="text-destructive">MMA is highly unpredictable and upset-prone. This tool is for informational purposes only.</span>
      </div>

      <main className="max-w-5xl mx-auto px-4 pt-8">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 uppercase font-sans">
              <Swords className="w-8 h-8 text-primary" />
              UFC Card Analyzer
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-xl">
              War-room intelligence for serious bettors. Grounded in stats, tailored for precise scouting.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-full md:w-[300px] bg-card border-card-border">
                <SelectValue placeholder={isLoadingEvents ? "Loading events..." : "Select an upcoming event"} />
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name} ({new Date(event.date).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleAnalyze} 
              disabled={!selectedEventId || isAnalyzing || selectedEventId === analyzingEventId}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isAnalyzing ? "Fetching Card..." : "Analyze Card"}
            </Button>
          </div>
        </header>

        {eventCard && (
          <div className="space-y-6">
            <div className="mb-6 pb-4 border-b border-border">
              <h2 className="text-2xl font-bold">{eventCard.name}</h2>
              <div className="text-muted-foreground text-sm mt-1 space-x-4 flex items-center">
                <span>{new Date(eventCard.date).toLocaleDateString()}</span>
                {eventCard.venue && <span>• {eventCard.venue}</span>}
                {eventCard.location && <span>• {eventCard.location}</span>}
              </div>
            </div>

            <div className="space-y-4">
              {eventCard.fights.map((fight) => (
                <FightRow key={fight.id} fight={fight} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}