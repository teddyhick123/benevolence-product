'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-5">
      <Link href="/" className="font-serif text-2xl leading-none text-azure">B.</Link>
      <h1 className="text-2xl font-semibold">Reset your password</h1>

      {sent ? (
        <div className="rounded border bg-green-50 p-4 text-sm text-green-800">
          Check your email — we&apos;ve sent a password reset link to <strong>{email}</strong>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-neutral-600">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
          <input
            type="email"
            placeholder="you@company.com"
            className="w-full border border-black/10 rounded-2xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-azure/30"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            disabled={busy}
            className="px-4 py-2 rounded bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-sm text-neutral-600">
        <Link href="/login" className="text-azure hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
