import { useLocation } from 'wouter';
import { Shield, TrendingUp, BarChart3, Lock, Zap, Target } from 'lucide-react';

const GREEN = '#22e66e';

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: 'linear-gradient(180deg, #07070f 0%, #0a0a14 60%, #0b0b18 100%)' }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-8 py-4 border-b"
        style={{ background: 'rgba(7,7,15,0.85)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-xs"
            style={{ background: 'rgba(34,230,110,0.12)', color: GREEN, border: '1px solid rgba(34,230,110,0.25)' }}>
            GP
          </div>
          <span className="font-black uppercase tracking-widest text-sm text-white">
            Gavin's <span style={{ color: GREEN }}>Picks</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/sign-in')}
            className="text-xs font-mono font-bold uppercase tracking-widest text-white/50 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign In
          </button>
          <button
            onClick={() => setLocation('/sign-up')}
            className="text-xs font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all"
            style={{ background: GREEN, color: '#000' }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center text-center px-5 pt-20 pb-24 sm:pt-28 sm:pb-32 overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(34,230,110,0.07) 0%, transparent 70%)'
          }} />

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-6"
            style={{ borderColor: 'rgba(34,230,110,0.3)', background: 'rgba(34,230,110,0.06)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]" style={{ color: GREEN }}>
              AI-Powered UFC Analysis
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tight text-white leading-[0.9] mb-6">
            Gavin's<br />
            <span style={{
              color: GREEN,
              textShadow: `0 0 40px rgba(34,230,110,0.4)`,
            }}>Picks™</span>
          </h1>

          <p className="max-w-xl text-base sm:text-lg text-white/50 leading-relaxed mb-10 font-mono">
            Deep AI scouting on every UFC fight. Live odds, radar comparisons,
            style breakdowns, and a running W‑L record — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => setLocation('/sign-up')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: GREEN, color: '#000', boxShadow: `0 0 32px rgba(34,230,110,0.3)` }}
            >
              Get Started — Free
            </button>
            <button
              onClick={() => setLocation('/sign-in')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm border transition-all hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
            >
              Sign In
            </button>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section className="px-5 sm:px-8 pb-20 sm:pb-28 max-w-5xl mx-auto">
          <p className="text-center text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/30 mb-10">
            What you get
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: <Zap className="w-5 h-5" />,
                title: 'AI Scout Reports',
                desc: 'GPT-powered deep analysis on every fight — style clash, upset path, tape review, and a clear pick with confidence rating.',
                color: GREEN,
              },
              {
                icon: <BarChart3 className="w-5 h-5" />,
                title: 'Radar Comparisons',
                desc: 'Side-by-side radar charts scoring both fighters across striking, grappling, cardio, chin, power, and defense.',
                color: '#60a5fa',
              },
              {
                icon: <TrendingUp className="w-5 h-5" />,
                title: 'Live Odds',
                desc: 'Real-time betting odds with one-click conversion between American, Decimal, and Implied Probability formats.',
                color: '#a78bfa',
              },
              {
                icon: <Target className="w-5 h-5" />,
                title: 'Common Opponent Tape',
                desc: 'See how both fighters performed against shared opponents, with expandable tape breakdowns for every matchup.',
                color: '#fb923c',
              },
              {
                icon: <Lock className="w-5 h-5" />,
                title: 'Locked-In Picks',
                desc: 'Gavin\'s picks are set in stone once generated — no retroactive changes. What you see is what was called.',
                color: GREEN,
              },
              {
                icon: <Shield className="w-5 h-5" />,
                title: 'W-L Record Tracking',
                desc: 'Every pick is tracked automatically. Watch the running W-L record and win percentage update after each event.',
                color: '#f87171',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="rounded-2xl border p-5 sm:p-6 space-y-3 transition-all hover:border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${f.color}15`, color: f.color }}>
                  {f.icon}
                </div>
                <h3 className="font-black uppercase tracking-tight text-sm text-white">{f.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────── */}
        <section className="px-5 sm:px-8 pb-24 max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 sm:p-12"
            style={{
              background: 'linear-gradient(135deg, rgba(34,230,110,0.06) 0%, rgba(34,230,110,0.02) 100%)',
              borderColor: 'rgba(34,230,110,0.2)',
              boxShadow: '0 0 60px rgba(34,230,110,0.06)',
            }}>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-4">
              Ready to pick <span style={{ color: GREEN }}>smarter?</span>
            </h2>
            <p className="text-white/40 font-mono text-sm mb-8 max-w-md mx-auto">
              Create your free account and get AI scouting on every UFC card.
            </p>
            <button
              onClick={() => setLocation('/sign-up')}
              className="px-10 py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:scale-[1.02]"
              style={{ background: GREEN, color: '#000', boxShadow: `0 0 32px rgba(34,230,110,0.25)` }}
            >
              Create Free Account
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t px-5 sm:px-8 py-8"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px]"
              style={{ background: 'rgba(34,230,110,0.1)', color: GREEN, border: '1px solid rgba(34,230,110,0.2)' }}>
              GP
            </div>
            <span className="font-black uppercase tracking-widest text-xs text-white/60">
              Gavin's <span style={{ color: GREEN }}>Picks™</span>
            </span>
          </div>
          <div className="text-center sm:text-right space-y-1">
            <p className="text-[10px] font-mono text-white/25">
              © {new Date().getFullYear()} Gavin's Picks™. All rights reserved.
            </p>
            <p className="text-[10px] font-mono text-white/20">
              For entertainment purposes only. Please gamble responsibly.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
