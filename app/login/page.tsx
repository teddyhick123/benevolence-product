'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { branding } from '@/lib/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
async function postAuthDestination(fallback: string, isNewUser: boolean = false) {
  // New users always go to onboarding
  if (isNewUser) {
    return '/onboarding';
  }

  try {
    // Check if admin
    const adminRes = await fetch('/api/admin/is_admin', { cache: 'no-store' });
    if (adminRes.ok) {
      const adminData = await adminRes.json();
      if (adminData?.is_admin) return '/admin/console';
    }

    // Check onboarding status for existing users
    const onboardingRes = await fetch('/api/onboarding/session', { cache: 'no-store' });
    if (onboardingRes.ok) {
      const onboardingData = await onboardingRes.json();
      // If no session or session not completed, go to onboarding
      if (!onboardingData.session || onboardingData.session.status !== 'completed') {
        return '/onboarding';
      }
    }

    const meRes = await fetch('/api/me', { cache: 'no-store' });
    if (meRes.ok) {
      const me = await meRes.json();
      if (me?.recommended_portfolio_id) {
        return `/dashboard?portfolio_id=${encodeURIComponent(me.recommended_portfolio_id)}`;
      }
    }
  } catch {}
  return fallback; // '/welcome' if onboarding completed
}
function LoginPageContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const redirect = useMemo(() => sp.get('redirect') || '/welcome', [sp]);
  const brandInitial = branding.appName.charAt(0).toUpperCase();

  const [mode, setMode] = useState<'signin' | 'signup'>(
    sp.get('signup') === '1' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [existingUserEmail, setExistingUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (data.user) {
        setExistingUserEmail(data.user.email ?? '');
      } else {
        setExistingUserEmail(null);
      }
      setSessionChecked(true);
    });
    return () => { mounted = false; };
  }, []);
  async function syncServerCookies(tokens?: { access_token: string; refresh_token: string }) {
    let access_token = tokens?.access_token;
    let refresh_token = tokens?.refresh_token;

    if (!access_token || !refresh_token) {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) return;
      access_token = session.access_token;
      refresh_token = session.refresh_token;
    }

    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ access_token, refresh_token }),
    });

    if (!res.ok) {
      // Failed to sync server cookies, authentication may not persist
    }
  }

  async function onSignOutLocal() {
    setBusy(true);
    try {
      // Clear client and server cookies so Server Components/middleware agree
      await supabase.auth.signOut({ scope: 'local' });
      await fetch('/api/auth/session', { method: 'DELETE' });
      setExistingUserEmail(null);
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    await syncServerCookies({
      access_token: data.session?.access_token!,
      refresh_token: data.session?.refresh_token!,
    });
    const dest = await postAuthDestination(redirect);
    router.replace(dest);
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    if (password !== password2) return setError('Passwords do not match.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(error.message);

    if (data?.user && data?.session) {
      await syncServerCookies({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      // New users go directly to onboarding
      const dest = await postAuthDestination(redirect, true);
      router.replace(dest);
    } else {
      // If confirmations are ON, ask user to verify email:
      setInfo('Account created. Check your email to confirm your address, then sign in.');
      setMode('signin');
    }
  }

  const [busy, setBusy] = useState(false);
  const isSignIn = mode === 'signin';

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="grid w-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-soft lg:grid-cols-[1fr_1.15fr]">
        <section className="bg-azure-deep px-8 py-10 text-creme sm:px-10 lg:px-12">
          <div className="mb-12 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-creme/15 bg-creme/10">
              <span className="font-serif text-3xl leading-none text-creme">
                {brandInitial}<span className="text-coral">.</span>
              </span>
            </div>
            <div className="font-serif text-2xl font-semibold">{branding.appName}</div>
          </div>
          <h1 className="max-w-sm font-serif text-3xl font-medium leading-tight sm:text-4xl">
            Welcome back to your philanthropic operating system.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-creme/70">
            Sign in to manage portfolios, grants, donor relationships, tax obligations, and compliance from one workspace.
          </p>
        </section>

        <div className="px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="mb-8">
            <p className="text-sm font-medium text-azure">{isSignIn ? 'Sign in' : 'Create account'}</p>
            <h2 className="mt-2 font-serif text-3xl font-medium text-ink">
              {isSignIn ? 'Continue your work.' : 'Start with a clean workspace.'}
            </h2>
          </div>

          {existingUserEmail && (
            <div className="mb-6 rounded-2xl border border-sunset/30 bg-sunset/10 p-4 text-sm text-ink">
              <p>You are already signed in as <span className="font-medium">{existingUserEmail}</span>.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                  onClick={async () => { setBusy(true); try { await syncServerCookies(); const dest = await postAuthDestination(redirect, false); router.replace(dest); } finally { setBusy(false); } }}
                  disabled={busy}
                >Continue</button>
                <button
                  className="rounded-2xl border border-black/10 px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow disabled:opacity-50 will-change-transform rm:transition-none rm:transform-none"
                  onClick={onSignOutLocal}
                  disabled={busy}
                >Sign out here</button>
              </div>
            </div>
          )}

          {sessionChecked && (isSignIn ? (
            <form onSubmit={onSignIn} className="space-y-4">
              <label htmlFor="signin-email" className="sr-only">Email address</label>
              <input
                id="signin-email"
                type="email" placeholder="you@company.com" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username email"
              />
              <label htmlFor="signin-password" className="sr-only">Password</label>
              <input
                id="signin-password"
                type="password" placeholder="Password" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"
              />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              {info && <p className="text-sm text-green-700" role="status">{info}</p>}
              <button disabled={busy} className="w-full rounded-2xl bg-azure px-4 py-3 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50">
                {busy ? 'Signing in...' : 'Sign in'}
              </button>
              <p className="text-sm text-neutral-600">
                <a href="/forgot-password" className="text-azure hover:underline">Forgot password?</a>
              </p>
              <p className="text-sm text-neutral-600">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setMode('signup')} className="font-medium text-azure hover:underline">
                  Create one
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={onSignUp} className="space-y-4">
              <label htmlFor="signup-email" className="sr-only">Email address</label>
              <input
                id="signup-email"
                type="email" placeholder="you@company.com" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username email"
              />
              <label htmlFor="signup-password" className="sr-only">Password</label>
              <input
                id="signup-password"
                type="password" placeholder="Password (min 6 chars)" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password"
              />
              <label htmlFor="signup-password2" className="sr-only">Confirm password</label>
              <input
                id="signup-password2"
                type="password" placeholder="Confirm password" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                value={password2} onChange={e=>setPassword2(e.target.value)} required autoComplete="new-password"
              />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              {info && <p className="text-sm text-green-700" role="status">{info}</p>}
              <button disabled={busy} className="w-full rounded-2xl bg-azure px-4 py-3 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50">
                {busy ? 'Creating...' : 'Create account'}
              </button>
              <p className="text-sm text-neutral-600">
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('signin')} className="font-medium text-azure hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
