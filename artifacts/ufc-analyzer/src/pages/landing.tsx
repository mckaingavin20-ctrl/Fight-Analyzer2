import { useLocation } from 'wouter';
import { Shield, TrendingUp, BarChart3, Lock, Zap, Target, Activity } from 'lucide-react';

const GOLD   = '#f59e0b';
const VIOLET = '#7c3aed';

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#07070e' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-8 py-4 border-b"
        style={{ background: 'rgba(7,7,14,0.9)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-xs"
            style={{ background: 'rgba(124,58,237,0.15)', color: VIOLET, border: '1px solid rgba(124,58,237,0.3)' }}>
            GP
          </div>
          <span className="font-black uppercase tracking-widest text-sm text-white">
            Gavin's <span style={{ color: GOLD }}>Picks™</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation('/sign-in')}
            className="text-xs font-mono font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors px-3 py-1.5">
            Sign In
          </button>
          <button onClick={() => setLocation('/sign-up')}
            className="text-xs font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all hover:opacity-90"
            style={{ background: GOLD, color: '#000' }}>
            Get Access
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center text-center px-5 pt-20 pb-24 sm:pt-32 sm:pb-36 overflow-hidden">
          {/* Background glows */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse 50% 35% at 30% 50%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 70% 50%, rgba(245,158,11,0.06) 0%, transparent 60%)'
          }} />

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-8"
            style={{ borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.08)' }}>
            <Activity className="w-3 h-3" style={{ color: VIOLET }} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.25em]" style={{ color: VIOLET }}>
              AI-Powered Fight Intelligence
            </span>
          </div>

          <h1 className="text-5xl sm:text-8xl font-black uppercase leading-[0.85] mb-8 relative">
            <span className="text-white">Gavin's</span>
            <br />
            <span style={{
              color: GOLD,
              textShadow: `0 0 60px rgba(245,158,11,0.35), 0 0 120px rgba(245,158,11,0.15)`,
            }}>Picks™</span>
          </h1>

          <p className="max-w-lg text-base sm:text-lg leading-relaxed mb-10 font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Deep AI scouting on every UFC fight. Style breakdowns, physical matchup analysis,
            tape review, and locked-in picks — with a live W‑L record.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button onClick={() => setLocation('/sign-up')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: GOLD, color: '#000', boxShadow: `0 0 40px rgba(245,158,11,0.3)` }}>
              Get Started — Free
            </button>
            <button onClick={() => setLocation('/sign-in')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm border transition-all hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              Sign In
            </button>
          </div>

          {/* Social proof strip */}
          <div className="mt-14 flex items-center gap-6 flex-wrap justify-center">
            {[
              { label: 'AI Picks', val: '80%+', note: 'accuracy' },
              { label: 'Analysis Depth', val: '9-pt', note: 'scout report' },
              { label: 'Data Sources', val: '3', note: 'live feeds' },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-black" style={{ color: GOLD }}>{s.val}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">{s.label}</span>
                <span className="text-[9px] font-mono text-white/20">{s.note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section className="px-5 sm:px-8 pb-20 sm:pb-28 max-w-5xl mx-auto">
          <p className="text-center text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/25 mb-10">
            What you get
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Zap className="w-5 h-5" />, title: 'Deep AI Scout Reports', desc: 'GPT-powered analysis on every fight — physical matchup, strike differential, grappling projection, tape review, and a clear pick with reasoning.', color: GOLD },
              { icon: <BarChart3 className="w-5 h-5" />, title: 'Radar Comparisons', desc: 'Side-by-side scoring across striking, grappling, cardio, chin, power, and defense for every fighter on the card.', color: VIOLET },
              { icon: <TrendingUp className="w-5 h-5" />, title: 'Live Odds + Formats', desc: 'Real-time betting odds with one-click conversion between American, Decimal, and Implied Probability.', color: '#60a5fa' },
              { icon: <Target className="w-5 h-5" />, title: 'Common Opponent Tape', desc: 'Shared opponent breakdowns comparing HOW each fighter performed — round stopped, damage taken, what was exposed.', color: '#fb923c' },
              { icon: <Lock className="w-5 h-5" />, title: 'Locked-In Picks', desc: "Picks are set in stone once generated. No retroactive changes. What you see is exactly what was called before the fight.", color: GOLD },
              { icon: <Shield className="w-5 h-5" />, title: 'W-L Record Tracking', desc: 'Every pick tracked automatically. Full history with correct / wrong / pending breakdown and running accuracy %.', color: '#4ade80' },
            ].map((f, i) => (
              <div key={i} className="rounded-2xl border p-5 sm:p-6 space-y-3 transition-all hover:border-white/10"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
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

        {/* ── CTA ── */}
        <section className="px-5 sm:px-8 pb-24 max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 sm:p-12" style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.07) 0%, rgba(245,158,11,0.05) 100%)',
            borderColor: 'rgba(124,58,237,0.2)',
            boxShadow: '0 0 80px rgba(124,58,237,0.06)',
          }}>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-4">
              Ready to pick <span style={{ color: GOLD }}>smarter?</span>
            </h2>
            <p className="text-white/40 font-mono text-sm mb-8 max-w-md mx-auto">
              Create your free account and get AI scouting on every UFC card.
            </p>
            <button onClick={() => setLocation('/sign-up')}
              className="px-10 py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:scale-[1.02]"
              style={{ background: GOLD, color: '#000', boxShadow: `0 0 40px rgba(245,158,11,0.25)` }}>
              Create Free Account
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t px-5 sm:px-8 py-8" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px]"
              style={{ background: 'rgba(124,58,237,0.12)', color: VIOLET, border: '1px solid rgba(124,58,237,0.25)' }}>
              GP
            </div>
            <span className="font-black uppercase tracking-widest text-xs text-white/50">
              Gavin's <span style={{ color: GOLD }}>Picks™</span>
            </span>
          </div>
          <div className="text-center sm:text-right space-y-1">
            <p className="text-[10px] font-mono text-white/20">© {new Date().getFullYear()} Gavin's Picks™. All rights reserved.</p>
            <p className="text-[10px] font-mono text-white/15">For entertainment purposes only. Please gamble responsibly.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
