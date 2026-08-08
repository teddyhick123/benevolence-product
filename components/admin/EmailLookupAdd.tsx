// components/admin/EmailLookupAdd.tsx
'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';

type Props = {
  portfolioId: string;
};

export default function EmailLookupAdd({ portfolioId }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'member' | 'admin' | 'owner'>('viewer');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      // 1) Lookup user by email (admin endpoint)
      const res = await apiRequest(`/api/admin/users/lookup?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j?.error || 'Lookup failed');
      if (!j?.data?.id) throw new Error('No user found for that email');

      const userId = j.data.id as string;

      // 2) Add membership
      const addRes = await apiRequest(`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const addJ = await readJson(addRes).catch(() => ({}));
      if (!addRes.ok) throw new Error(addJ?.error || 'Failed to add member');

      setMsg({ kind: 'ok', text: `Added ${email} as ${role}.` });
      setEmail('');
      setRole('viewer');

      // Refresh to show the new member
      setTimeout(() => { window.location.reload(); }, 600);
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || 'Action failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <input
        type="email"
        placeholder="user@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border rounded-2xl px-3 py-2 md:col-span-2"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as any)}
        className="border rounded-2xl px-3 py-2"
      >
        <option value="viewer">viewer</option>
        <option value="member">member</option>
        <option value="admin">admin</option>
        <option value="owner">owner</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add member'}
      </button>

      {msg && (
        <div className={`md:col-span-4 text-sm ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}
