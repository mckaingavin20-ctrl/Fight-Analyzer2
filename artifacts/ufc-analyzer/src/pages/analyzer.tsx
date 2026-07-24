import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { useListEvents, useGetEventCard, useGetRecord, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { FightRow } from '@/components/fight-row';
import { RecordTab } from '@/components/record-tab';
import { ScheduleTab } from '@/components/schedule-tab';
import { Skeleton } from '@/components/ui/skeleton';
import { LogOut, LayoutGrid, Trophy, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const GOLD   = '#f59e0b';
const VIOLET = '#7c3aed';

type Tab = 'card' | 'record' | 'schedule';

export default function Analyzer() {
  const [tab, setTab]                         = useState<Tab>('card');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data: events, isLoading: isLoadingEvents } = useListEvents();
  const { data: record } = useGetRecord({ query: { staleTime: 1000 * 60 * 2, refetchInterval: 1000 * 60 * 2 } });

  // Default to first upcoming event (nearest date), regardless of odds
  useEffect(() => {
    if (!events?.length || selectedEventId) return;
    const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setSelectedEventId(sorted[0].id);
  }, [events, selectedEventId]);

  const selectedEvent = events?.find(e => e.id === selectedEventId);
  const { data: eventCard, isLoading: isLoadingCard } = useGetEventCard(selectedEventId, {
    query: {
      enabled: !!selectedEventId,
      queryKey: getGetEventCardQueryKey(selectedEventId),
      staleTime: 1000 * 60 * 5,
    },
  });

  const basePath   = import.meta.env.BASE_URL.replace(/\/$/, '');
  const initials   = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase();
  const displayName = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? '';

  const wins    = record?.wins   ?? 0;
  const losses  = record?.losses ?? 0;
  const pct     = record?.pct    ?? null;
  const hasRecord = wins > 0 || losses > 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'card',     label: 'Card',     icon: <LayoutGrid   className="w-3.5 h-3.5" /> },
    { id: 'record',   label: 'Record',   icon: <Trophy       className="w-3.5 h-3.5" /> },
    { id: 'schedule', label: 'Schedule', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#07070e' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b px-4 sm:px-6"
        style={{ background: 'rgba(7,7,14,0.92)', backdropFilter: 'blur(18px)', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black tracking-tight"
              style={{ background: 'rgba(124,58,237,0.14)', color: VIOLET, border: `1px solid rgba(124,58,237,0.28)` }}>
              GP
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                Gavin's <span style={{ color: GOLD }}>Picks™</span>
              </span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* W-L pill */}
            {hasRecord && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-bold border"
                style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
                <span style={{ color: GOLD }}>{wins}W–{losses}L</span>
                {pct !== null && (
                  <>
                    <span className="text-white/20">·</span>
                    <span style={{ color: pct >= 60 ? '#4ade80' : pct >= 50 ? GOLD : '#f87171' }}>{pct}%</span>
                  </>
                )}
              </div>
            )}

            {/* Live dot */}
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: VIOLET }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: VIOLET }} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: `${VIOLET}99` }}>Live</span>
            </div>

            {/* User */}
            {user && (
              <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ background: 'rgba(245,158,11,0.14)', color: GOLD }}>{initials}</div>
                <span className="hidden md:block text-[10px] font-mono text-white/30 max-w-[100px] truncate">{displayName}</span>
                <button onClick={() => signOut({ redirectUrl: basePath || '/' })}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Sign out">
                  <LogOut className="w-3.5 h-3.5 text-white/20 hover:text-white/50" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 -mb-px">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap',
                tab === t.id ? 'border-b-amber-500 text-white' : 'border-b-transparent text-white/30 hover:text-white/60'
              )}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'card'     && (
          <CardTab
            events={events}
            isLoadingEvents={isLoadingEvents}
            selectedEventId={selectedEventId}
            setSelectedEventId={setSelectedEventId}
            selectedEvent={selectedEvent}
            eventCard={eventCard}
            isLoadingCard={isLoadingCard}
          />
        )}
        {tab === 'record'   && <RecordTab record={record} />}
        {tab === 'schedule' && (
          <ScheduleTab
            events={events}
            isLoading={isLoadingEvents}
            onSelectEvent={(id) => { setSelectedEventId(id); setTab('card'); }}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t px-4 py-4 text-center" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
          © {new Date().getFullYear()} Gavin's Picks™ · For entertainment purposes only · Gamble responsibly
        </p>
      </footer>
    </div>
  );
}

/* ── Card Tab ── */
function CardTab({
  events, isLoadingEvents, selectedEventId, setSelectedEventId,
  selectedEvent, eventCard, isLoadingCard,
}: {
  events: any; isLoadingEvents: boolean; selectedEventId: string;
  setSelectedEventId: (id: string) => void; selectedEvent: any;
  eventCard: any; isLoadingCard: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Event selector chips */}
      {isLoadingEvents ? (
        <Skeleton className="h-10 w-full rounded-full bg-white/[0.04]" />
      ) : events?.length ? (
        <div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {events.map((ev: any) => (
              <button key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                className="shrink-0 px-4 py-2 rounded-full text-[11px] font-mono font-bold border transition-all whitespace-nowrap"
                style={selectedEventId === ev.id
                  ? { background: GOLD, color: '#000', borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }
                }>
                {ev.name.replace(/^UFC\s+/i, 'UFC ').replace(/Fight Night:\s*/i, 'FN: ')}
                {!ev.hasOdds && <span className="ml-1.5 opacity-60">· TBD</span>}
              </button>
            ))}
          </div>
          {selectedEvent && (
            <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-[11px] font-mono text-white/25">
              <span>{new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              {selectedEvent.location && (<><span className="text-white/15">·</span><span>{selectedEvent.location}</span></>)}
              {!selectedEvent.hasOdds && (
                <span className="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest"
                  style={{ color: GOLD, borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)' }}>
                  Odds TBD — AI uses fighter knowledge
                </span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Fights */}
      {isLoadingCard ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : eventCard?.fights?.length ? (
        <div className="space-y-3">
          {eventCard.fights.map((fight: any) => <FightRow key={fight.id} fight={fight} />)}
        </div>
      ) : (
        <div className="rounded-2xl border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          <p className="text-3xl mb-3">🥊</p>
          <p className="font-black uppercase tracking-tight text-white mb-2">Card Not Available Yet</p>
          <p className="text-xs font-mono text-white/30">Fighter lineup hasn't been posted for this event.</p>
        </div>
      )}
    </div>
  );
}
