// app/join/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

type InviteState =
  | { status: 'loading' }
  | { status: 'valid'; orgName: string; role: string; email: string }
  | { status: 'invalid'; reason: string }
  | { status: 'accepting' }
  | { status: 'accepted' }
  | { status: 'error'; message: string };

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [state, setState] = useState<InviteState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', reason: 'No invitation token provided.' });
      return;
    }

    async function validateAndMaybeAccept() {
      const res = await fetch(`/api/invitations/${token}`);
      const data = await res.json();

      if (!data.valid) {
        const messages: Record<string, string> = {
          not_found: 'This invitation link is invalid.',
          expired: 'This invitation has expired. Please ask for a new one.',
          cancelled: 'This invitation has been cancelled.',
          already_accepted: 'This invitation has already been accepted.',
        };
        setState({ status: 'invalid', reason: messages[data.reason] || 'This invitation is no longer valid.' });
        return;
      }

      setState({ status: 'valid', orgName: data.invitation.orgName, role: data.invitation.role, email: data.invitation.email });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await acceptInvitation();
      }
    }

    validateAndMaybeAccept();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function acceptInvitation() {
    if (!token) return;
    setState({ status: 'accepting' });

    const res = await fetch(`/api/invitations/${token}/accept`, { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      if (data.orgId) {
        document.cookie = `x-org-id=${data.orgId}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
      }
      setState({ status: 'accepted' });
      setTimeout(() => router.replace('/dashboard'), 1500);
    } else {
      setState({ status: 'error', message: data.error || 'Failed to accept invitation.' });
    }
  }

  function handleSignIn() {
    router.push(`/login?redirect=${encodeURIComponent(`/join?token=${token}`)}`);
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <p className="text-black/50">Validating invitation…</p>
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">Invalid Invitation</p>
          <p className="text-black/60 mb-6">{state.reason}</p>
          <Link href="/" className="text-azure text-sm underline">Go home</Link>
        </div>
      </div>
    );
  }

  if (state.status === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <p className="text-black/50">Joining organization…</p>
      </div>
    );
  }

  if (state.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">You&apos;re in!</p>
          <p className="text-black/60">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">Something went wrong</p>
          <p className="text-black/60 mb-4">{state.message}</p>
          <button onClick={handleSignIn} className="text-azure text-sm underline">Try signing in again</button>
        </div>
      </div>
    );
  }

  // status === 'valid', user not yet logged in
  return (
    <div className="min-h-screen flex items-center justify-center bg-creme">
      <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">You&apos;ve been invited</h1>
        <p className="text-black/60 mb-6">
          Join <strong>{state.orgName}</strong> as a <strong>{state.role}</strong>.
        </p>
        <button
          onClick={handleSignIn}
          className="w-full py-3 rounded-md bg-azure text-white font-medium hover:opacity-90 transition-opacity"
        >
          Sign in to accept
        </button>
        <p className="mt-4 text-xs text-black/40 text-center">
          Don&apos;t have an account? You&apos;ll be able to create one.
        </p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <p className="text-black/50">Loading…</p>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
