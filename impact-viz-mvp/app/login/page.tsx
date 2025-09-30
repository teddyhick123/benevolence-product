'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
async function postAuthDestination(fallback: string) {
  try {
    const r = await fetch('/api/admin/is_admin', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j?.is_admin) return '/admin/console';
    }
  } catch {}
  return fallback; // usually '/welcome'
}
export default function LoginPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const redirect = useMemo(() => sp.get('redirect') || '/welcome', [sp]);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
      // Optional console to aid debugging in dev
      try { console.warn('Failed to sync server cookies', await res.json()); } catch {}
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
      const dest = await postAuthDestination(redirect);
      router.replace(dest);
    } else {
      // If confirmations are ON, ask user to verify email:
      setInfo('Account created. Check your email to confirm your address, then sign in.');
      setMode('signin');
    }
  }

  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-md p-6 space-y-5">
      <h1 className="text-2xl font-semibold">Welcome to Benevolence</h1>

      {existingUserEmail && (
        <div className="rounded border bg-yellow-50 p-3 text-sm">
          <p>You are already signed in as <span className="font-medium">{existingUserEmail}</span>.</p>
          <div className="mt-2 flex gap-2">
            <button
              className="px-3 py-1.5 rounded bg-gray-900 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              onClick={async () => { setBusy(true); try { await syncServerCookies(); const dest = await postAuthDestination(redirect); router.replace(dest); } finally { setBusy(false); } }}
              disabled={busy}
            >Continue</button>
            <button
              className="px-3 py-1.5 rounded border border-black/10 hover:bg-white shadow-sm hover:shadow disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              onClick={onSignOutLocal}
              disabled={busy}
            >Sign out here</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none ${mode==='signin' ? 'bg-gray-900 text-white shadow-soft' : 'border border-black/10 shadow-sm hover:shadow'}`}
          onClick={() => setMode('signin')}
        >Sign in</button>
        <button
          className={`px-3 py-1.5 rounded transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none ${mode==='signup' ? 'bg-gray-900 text-white shadow-soft' : 'border border-black/10 shadow-sm hover:shadow'}`}
          onClick={() => setMode('signup')}
        >Create account</button>
      </div>

      {sessionChecked && (mode === 'signin' ? (
        <form onSubmit={onSignIn} className="space-y-3">
          <input
            type="email" placeholder="you@company.com" className="w-full border border-black/10 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username email"
          />
          <input
            type="password" placeholder="Password" className="w-full border border-black/10 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {info && <p className="text-green-700 text-sm">{info}</p>}
          <button disabled={busy} className="px-4 py-2 rounded bg-gray-900 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSignUp} className="space-y-3">
          <input
            type="email" placeholder="you@company.com" className="w-full border border-black/10 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username email"
          />
          <input
            type="password" placeholder="Password (min 6 chars)" className="w-full border border-black/10 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password"
          />
          <input
            type="password" placeholder="Confirm password" className="w-full border border-black/10 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={password2} onChange={e=>setPassword2(e.target.value)} required autoComplete="new-password"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {info && <p className="text-green-700 text-sm">{info}</p>}
          <button disabled={busy} className="px-4 py-2 rounded bg-gray-900 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      ))}
    </div>
  );
}