import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'gavins-picks-age-verified';

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    setVerified(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const confirm = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVerified(true);
  };

  // Prevent flash of gate on already-verified users
  if (verified === null) return null;

  if (verified) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#08080f] flex flex-col items-center justify-center p-6">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,230,100,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,230,100,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div
          className="bg-[#0f0f1e] border border-[#1e1e36] rounded-2xl p-8 shadow-2xl text-center"
          style={{ boxShadow: '0 0 60px rgba(0, 230, 100, 0.06)' }}
        >
          {/* Shield icon */}
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-green-400" />
            </div>
          </div>

          {/* Brand */}
          <div className="mb-1">
            <span className="text-2xl font-black uppercase tracking-widest text-white">
              GAVIN'S
            </span>
            <span className="text-2xl font-black uppercase tracking-widest text-green-400">
              {' '}PICKS
            </span>
          </div>

          <p className="text-[11px] font-mono text-gray-500 uppercase tracking-widest mb-6">
            Age Verification Required
          </p>

          <div className="bg-[#0a0a18] border border-white/5 rounded-lg px-4 py-3 mb-6 text-xs text-gray-400 leading-relaxed">
            This site contains sports analysis and pick recommendations. You must be{' '}
            <span className="text-white font-semibold">18 years or older</span> to enter.
            Please gamble responsibly.
          </div>

          <button
            onClick={confirm}
            className="w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-sm text-black transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #00e664, #00c853)' }}
          >
            I'm 18 or Older — Enter
          </button>

          <button
            onClick={() => window.history.back()}
            className="w-full mt-3 py-2.5 text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
          >
            I am under 18 — Exit
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-700 font-mono mt-4 px-4">
          Gavin's Picks is for entertainment only. Never bet more than you can afford to lose.
        </p>
      </div>
    </div>
  );
}
