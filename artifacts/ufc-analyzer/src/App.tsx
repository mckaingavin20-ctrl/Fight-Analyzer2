import { useEffect, useRef } from 'react';
import {
  ClerkProvider, SignIn, SignUp, Show, useClerk, useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Analyzer from '@/pages/analyzer';
import Landing from '@/pages/landing';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

// ── Clerk keys (copy verbatim per skill) ───────────────────────────────
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');

// ── Clerk dark-theme appearance ────────────────────────────────────────
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#22e66e',
    colorForeground: '#ffffff',
    colorMutedForeground: 'rgba(255,255,255,0.45)',
    colorDanger: '#f87171',
    colorBackground: '#0f0f1e',
    colorInput: 'rgba(255,255,255,0.06)',
    colorInputForeground: '#ffffff',
    colorNeutral: 'rgba(255,255,255,0.12)',
    fontFamily: "'Space Mono', 'Inter', monospace",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'w-[440px] max-w-full overflow-hidden rounded-2xl shadow-2xl shadow-black/60',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white font-black uppercase tracking-tight text-2xl',
    headerSubtitle: 'text-white/50 font-mono text-xs uppercase tracking-widest',
    socialButtonsBlockButtonText: 'text-white font-mono text-sm',
    formFieldLabel: 'text-white/60 font-mono text-[10px] uppercase tracking-[0.15em]',
    footerActionLink: { color: '#22e66e', fontFamily: 'monospace', fontWeight: 700 },
    footerActionText: { color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: '11px' },
    dividerText: { color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: '10px' },
    identityPreviewEditButton: { color: '#22e66e' },
    formFieldSuccessText: { color: '#22e66e', fontFamily: 'monospace', fontSize: '11px' },
    alertText: { color: '#f87171', fontFamily: 'monospace', fontSize: '11px' },
    logoBox: 'mb-1',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: 'border border-white/10 bg-white/5 hover:bg-white/10 transition-colors',
    formButtonPrimary: 'bg-[#22e66e] hover:bg-[#1dd460] text-black font-black uppercase tracking-widest transition-colors',
    formFieldInput: 'bg-white/[0.06] border border-white/10 text-white font-mono focus:border-[#22e66e]/60 focus:ring-0 transition-colors',
    footerAction: 'bg-transparent',
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    alert: 'bg-red-500/10 border border-red-500/20 rounded-lg',
    otpCodeFieldInput: 'bg-white/[0.06] border border-white/10 text-white font-mono text-center text-lg focus:border-[#22e66e]/60',
    main: 'gap-5',
  },
};

// ── Auth page wrappers ─────────────────────────────────────────────────
function SignInPage() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #07070f 0%, #0b0b18 100%)' }}
    >
      <div className="mb-8 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 mb-2">Welcome back</p>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          Gavin's <span style={{ color: '#22e66e' }}>Picks</span>
        </h1>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      <p className="mt-8 text-[10px] font-mono text-white/20 text-center">
        © Gavin's Picks™ · For entertainment purposes only
      </p>
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #07070f 0%, #0b0b18 100%)' }}
    >
      <div className="mb-8 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 mb-2">Join the action</p>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          Gavin's <span style={{ color: '#22e66e' }}>Picks</span>
        </h1>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      <p className="mt-8 text-[10px] font-mono text-white/20 text-center">
        © Gavin's Picks™ · For entertainment purposes only
      </p>
    </div>
  );
}

// ── Cache invalidation on user change ─────────────────────────────────
function CacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    return addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prevRef.current !== undefined && prevRef.current !== id) qc.clear();
      prevRef.current = id;
    });
  }, [addListener, qc]);
  return null;
}

// ── Home: landing for guests, redirect for signed-in ──────────────────
function HomeRoute() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/analyzer" /></Show>
      <Show when="signed-out"><Landing /></Show>
    </>
  );
}

// ── Protected analyzer route ───────────────────────────────────────────
function AnalyzerRoute() {
  return (
    <>
      <Show when="signed-in"><Analyzer /></Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

// ── Router ────────────────────────────────────────────────────────────
function AppRouter() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Sign in", subtitle: "Access your picks" } },
        signUp: { start: { title: "Create account", subtitle: "Start getting AI picks" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <CacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/analyzer" component={AnalyzerRoute} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <WouterRouter base={basePath}>
      <AppRouter />
    </WouterRouter>
  );
}
