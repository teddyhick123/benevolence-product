'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserAuthClient } from '@/lib/api/browser-auth-client';

const supabase = createBrowserAuthClient();

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase handles the token via onAuthStateChange — wait for PASSWORD_RECOVERY event
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      router.replace('/dashboard');
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-5">
      <Link href="/" className="font-serif text-2xl leading-none text-azure">B.</Link>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>

      {!ready ? (
        <p className="text-sm text-neutral-500">Verifying reset link…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="New password (min 6 chars)"
            className="w-full border border-black/10 rounded-2xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="w-full border border-black/10 rounded-2xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            required
            autoComplete="new-password"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            disabled={busy}
            className="px-4 py-2 rounded bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </div>
  );
}
