import { useLocation } from 'wouter';
import { TrendingUp, BarChart3, Lock, Zap, Target, Shield } from 'lucide-react';

const RED    = '#E11D48';
const GOLD   = '#F59E0B';
const GREEN  = '#22C55E';

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#09090B' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b flex items-center justify-between px-5 sm:px-10 h-14"
        style={{ background: 'rgba(9,9,11,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-display font-black text-sm"
            style={{ background: RED, color: '#fff', letterSpacing: '-0.02em' }}>G</div>
          <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '15px', letterSpacing: '0.08em', color: '#fff', textTransform: 'uppercase' }}>
            Gavin's <span style={{ color: GOLD }}>Picks™</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLocation('/sign-in')}
            className="px-4 py-1.5 text-xs font-semibold transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--app-font-mono)' }}>
            Sign In
          </button>
          <button onClick={() => setLocation('/sign-up')}
            className="px-5 py-2 text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
            style={{ background: RED, color: '#fff', fontFamily: 'var(--app-font-display)', fontSize: '12px', letterSpacing: '0.1em' }}>
            Get Access
          </button>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-5 sm:px-10 pt-20 pb-28 sm:pt-32 sm:pb-40">
          {/* Red accent bar — the big visual move */}
          <div className="absolute top-0 right-0 w-[45%] h-full pointer-events-none hidden sm:block"
            style={{
              background: `linear-gradient(135deg, transparent 0%, rgba(225,29,72,0.04) 50%, rgba(225,29,72,0.08) 100%)`,
              borderLeft: '1px solid rgba(225,29,72,0.1)',
            }} />
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.4), transparent)' }} />

          <div className="max-w-5xl mx-auto">
            {/* Label */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-1.5 h-5 rounded-sm" style={{ background: RED }} />
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', letterSpacing: '0.2em', color: RED, textTransform: 'uppercase', fontWeight: 700 }}>
                AI-Powered Fight Intelligence
              </span>
            </div>

            {/* Big headline */}
            <h1 style={{
              fontFamily: 'var(--app-font-display)',
              fontWeight: 900,
              fontSize: 'clamp(72px, 14vw, 160px)',
              lineHeight: 0.88,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              marginBottom: '32px',
            }}>
              <span style={{ color: '#FAFAFA', display: 'block' }}>Gavin's</span>
              <span style={{ color: GOLD, display: 'block' }}>Picks™</span>
            </h1>

            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-8 sm:gap-16">
              <p className="max-w-sm text-sm leading-relaxed" style={{ color: 'rgba(250,250,250,0.5)', fontFamily: 'var(--app-font-sans)' }}>
                Deep AI scouting on every UFC fight. Physical matchup analysis,
                fighter-data diagnostics, and evidence-based educational context.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <button onClick={() => setLocation('/sign-up')}
                  className="px-8 py-3.5 font-black uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: RED, color: '#fff', fontFamily: 'var(--app-font-display)', fontSize: '14px', letterSpacing: '0.1em' }}>
                  Get Started — Free
                </button>
                <button onClick={() => setLocation('/sign-in')}
                  className="px-8 py-3.5 font-black uppercase tracking-wider transition-all hover:bg-white/5 border"
                  style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--app-font-display)', fontSize: '14px', letterSpacing: '0.1em' }}>
                  Sign In
                </button>
              </div>
            </div>

            {/* Stats strip */}
            <div className="mt-16 grid grid-cols-3 gap-0 max-w-lg">
              {[
                { val: '7W–6L', label: 'Live Record', sub: 'fully auditable' },
                { val: '3', label: 'Data Layers', sub: 'per fight' },
                { val: '9-pt', label: 'Scout Report', sub: 'depth' },
              ].map((s, i) => (
                <div key={i} className="py-4 pr-8 border-r last:border-r-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '26px', color: GOLD, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--app-font-mono)', fontSize: '8px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Divider ── */}
        <div className="relative h-px mx-5 sm:mx-10" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent, ${RED}60, transparent)` }} />
        </div>

        {/* ── Features ── */}
        <section className="px-5 sm:px-10 py-20 sm:py-28 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-1.5 h-5 rounded-sm" style={{ background: RED }} />
            <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '22px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FAFAFA' }}>
              What's Inside
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            {[
              { icon: <Zap className="w-4 h-4" />, title: 'Deep AI Scout Reports', desc: 'GPT-powered analysis on every fight — physical matchup, strike differential, grappling projection, tape review, and a clear pick with full reasoning.', accent: RED },
              { icon: <BarChart3 className="w-4 h-4" />, title: 'Fighter Comparisons', desc: 'Side-by-side scoring across striking, grappling, cardio, chin, power, and defense. See the actual numbers behind each pick.', accent: GOLD },
              { icon: <TrendingUp className="w-4 h-4" />, title: 'Live Odds + Formats', desc: 'Real-time betting lines from top books. One-click toggle between American, Decimal, and Implied Probability.', accent: '#60A5FA' },
              { icon: <Target className="w-4 h-4" />, title: 'Common Opponent Tape', desc: 'Shared opponent breakdowns comparing HOW each fighter performed — round stopped, damage taken, what the tape reveals.', accent: '#FB923C' },
              { icon: <Lock className="w-4 h-4" />, title: 'Picks Locked in Stone', desc: "Picks are set the moment they're generated. No retroactive changes. What you see is exactly what was called before the fight.", accent: GREEN },
              { icon: <Shield className="w-4 h-4" />, title: 'W-L Record Tracking', desc: 'Every pick tracked automatically. Full history with correct/wrong/pending breakdown and running accuracy percentage.', accent: '#A78BFA' },
            ].map((f, i) => (
              <div key={i} className="p-7" style={{ background: '#111113' }}>
                <div className="w-8 h-8 flex items-center justify-center mb-4 border" style={{ borderColor: `${f.accent}30`, color: f.accent, background: `${f.accent}10` }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '16px', letterSpacing: '0.03em', textTransform: 'uppercase', color: '#FAFAFA', marginBottom: '8px' }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(250,250,250,0.4)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t border-b py-20 sm:py-28 px-5 sm:px-10" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-1.5 h-5 rounded-sm" style={{ background: RED }} />
              <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '22px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FAFAFA' }}>
                How It Works
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-16">
              {[
                { n: '01', title: 'Choose a UFC event', desc: 'Browse numbered UFC cards, Fight Nights, and Noche events with complete returned bouts, including prelims.' },
                { n: '02', title: 'Review the evidence', desc: 'Inspect fighter identity, records, source freshness, and the limits of the available evidence before reading the matchup context.' },
                { n: '03', title: 'Pick is Locked', desc: 'The pick and reasoning are stored permanently. No changes after generation. Your record is real — it tracks every call.' },
              ].map((s, i) => (
                <div key={i} className="flex gap-5">
                  <div style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: '56px', lineHeight: 1, color: `${RED}20`, flexShrink: 0 }}>{s.n}</div>
                  <div className="pt-1">
                    <h3 style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '17px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FAFAFA', marginBottom: '8px' }}>{s.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(250,250,250,0.4)' }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="px-5 sm:px-10 py-24 sm:py-32">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-10">
            <div>
              <h2 style={{ fontFamily: 'var(--app-font-display)', fontWeight: 900, fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: 0.9, textTransform: 'uppercase', color: '#FAFAFA' }}>
                Pick Smarter.<br /><span style={{ color: RED }}>Start Free.</span>
              </h2>
              <p className="mt-4 text-sm" style={{ color: 'rgba(250,250,250,0.35)', maxWidth: '320px' }}>
                Create an account and get full AI scouting on every fight on every upcoming UFC card.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <button onClick={() => setLocation('/sign-up')}
                className="px-10 py-4 font-black uppercase transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: RED, color: '#fff', fontFamily: 'var(--app-font-display)', fontSize: '16px', letterSpacing: '0.08em' }}>
                Create Free Account
              </button>
              <p className="text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--app-font-mono)' }}>
                No credit card · Free access
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t px-5 sm:px-10 py-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 flex items-center justify-center font-display font-black text-[10px]"
              style={{ background: RED, color: '#fff' }}>G</div>
            <span style={{ fontFamily: 'var(--app-font-display)', fontWeight: 800, fontSize: '13px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              Gavin's Picks™
            </span>
          </div>
          <div className="text-right space-y-1">
            <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>© {new Date().getFullYear()} Gavin's Picks™ · All rights reserved.</p>
            <p style={{ fontFamily: 'var(--app-font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>For entertainment purposes only. Please gamble responsibly.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
