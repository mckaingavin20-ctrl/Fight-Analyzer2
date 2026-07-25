import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { useListEvents, useGetEventCard, useGetRecord, getGetEventCardQueryKey } from '@workspace/api-client-react';
import { FightRow } from '@/components/fight-row';
import { RecordTab } from '@/components/record-tab';
import { ScheduleTab } from '@/components/schedule-tab';
import { Skeleton } from '@/components/ui/skeleton';
import { LogOut, LayoutGrid, Trophy, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const RED  = '#E11D48';
const GOLD = '#F59E0B';

type Tab = 'card' | 'record' | 'schedule';

export default function Analyzer() {
  const [tab, setTab]                         = useState<Tab>('card');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data: events, isLoading: isLoadingEvents } = useListEvents();
  const { data: record } = useGetRecord({ query: { staleTime: 1000 * 60 * 2, refetchInterval: 1000 * 60 * 2 } });

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

  const basePath    = import.meta.env.BASE_URL.replace(/\/$/, '');
  const initials    = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase();
  const displayName = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? '';

  const wins      = record?.wins   ?? 0;
  const losses    = record?.losses ?? 0;
  const pct       = record?.pct    ?? null;
  const hasRecord = wins > 0 || losses > 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'card',     label: 'Card',     icon: <LayoutGrid   className="w-3.5 h-3.5" /> },
    { id: 'record',   label: 'Record',   icon: <Trophy       className="w-3.5 h-3.5" /> },
    { id: 'schedule', label: 'Schedule', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#09090B' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-7 h-7 flex items-center justify-center font-black"
              style={{ background: RED, color: '#fff', fontFamily: 'var(--app-font-display)', fontSize: '14px' }}>G</div>
            <div className="hidden sm:block" style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '15px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>
              Gavin's <span style={{ color: GOLD }}>Picks™</span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* W-L pill */}
            {hasRecord && (
              <div className="flex items-center gap-0 border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="px-2.5 py-1 text-xs font-black" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', fontFamily: 'var(--app-font-display)', fontSize: '13px', letterSpacing: '0.04em' }}>
                  {wins}W
                </div>
                <div className="px-2.5 py-1 text-xs font-black border-l border-r" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontFamily: 'var(--app-font-display)', fontSize: '13px', letterSpacing: '0.04em', borderColor: 'rgba(255,255,255,0.08)' }}>
                  {losses}L
                </div>
                {pct !== null && (
                  <div className="px-2.5 py-1 text-xs font-black" style={{ background: 'rgba(255,255,255,0.04)', color: pct >= 60 ? '#22C55E' : pct >= 50 ? GOLD : '#EF4444', fontFamily: 'var(--app-font-mono)', fontSize: '11px' }}>
                    {pct}%
                  </div>
                )}
              </div>
            )}

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: RED }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: RED }} />
              </span>
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.15em', color: `${RED}99`, textTransform: 'uppercase' }}>Live</span>
            </div>

            {/* User */}
            {user && (
              <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="w-6 h-6 flex items-center justify-center text-[10px] font-black"
                  style={{ background: RED, color: '#fff', fontFamily: 'var(--app-font-display)' }}>{initials}</div>
                <span className="hidden md:block text-[10px] max-w-[90px] truncate" style={{ fontFamily: 'var(--app-font-mono)', color: 'rgba(255,255,255,0.3)' }}>{displayName}</span>
                <button onClick={() => signOut({ redirectUrl: basePath || '/' })}
                  className="p-1.5 hover:bg-white/5 transition-colors" title="Sign out">
                  <LogOut className="w-3.5 h-3.5 text-white/20 hover:text-white/50" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-4 sm:px-6 border-t -mt-px" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-b-current text-white' : 'border-b-transparent text-white/30 hover:text-white/60'
              )}
              style={tab === t.id ? { borderColor: RED, color: '#FAFAFA' } : {}}>
              <span style={{ color: 'inherit' }}>{t.icon}</span>
              <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'inherit' }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'card' && (
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

      <footer className="border-t px-4 py-4 text-center" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>
          © {new Date().getFullYear()} Gavin's Picks™ · For entertainment purposes only · Please gamble responsibly
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

      {/* Event selector */}
      {isLoadingEvents ? (
        <Skeleton className="h-9 w-full bg-white/[0.04]" />
      ) : events?.length ? (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {events.map((ev: any) => (
              <button key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                className="shrink-0 px-4 py-1.5 border transition-all whitespace-nowrap text-xs font-black uppercase"
                style={selectedEventId === ev.id
                  ? { background: RED, color: '#fff', borderColor: RED, fontFamily: 'var(--app-font-display)', fontSize: '12px', letterSpacing: '0.06em' }
                  : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)', fontFamily: 'var(--app-font-display)', fontSize: '12px', letterSpacing: '0.06em' }
                }>
                {ev.name.replace(/^UFC\s+/i, 'UFC ').replace(/Fight Night:\s*/i, 'FN: ')}
              </button>
            ))}
          </div>
          {selectedEvent && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                {new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              {selectedEvent.location && (
                <><span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
                <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{selectedEvent.location}</span></>
              )}
              {!selectedEvent.hasOdds && (
                <span className="px-2 py-0.5 border text-[9px] font-black uppercase"
                  style={{ color: GOLD, borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', fontFamily: 'var(--app-font-mono)', letterSpacing: '0.1em' }}>
                  Odds TBD — AI uses fighter knowledge
                </span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Fights */}
      {isLoadingCard ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full bg-white/[0.03]" />)}
        </div>
      ) : eventCard?.fights?.length ? (
        <div className="space-y-2">
          {eventCard.fights.map((fight: any) => <FightRow key={fight.id} fight={fight} />)}
        </div>
      ) : (
        <div className="border p-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          <p style={{ fontFamily: 'var(--app-font-display)', fontSize: '28px', fontWeight: 900, color: 'rgba(255,255,255,0.08)', textTransform: 'uppercase', marginBottom: '8px' }}>No Card Yet</p>
          <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>Fighter lineup hasn't been posted for this event.</p>
        </div>
      )}
    </div>
  );
}
