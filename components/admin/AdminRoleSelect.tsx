// components/admin/AdminRoleSelect.tsx
'use client';

import { useState } from 'react';

type Props = {
  portfolioId: string;
  userId: string;
  initialRole: 'viewer' | 'member' | 'admin' | 'owner' | string;
};

const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;

export default function AdminRoleSelect({ portfolioId, userId, initialRole }: Props) {
  const [role, setRole] = useState<string>(initialRole || 'viewer');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<'idle' | 'saved' | 'error'>('idle');

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = role;
    setRole(next);
    setSaving(true);
    setOk('idle');
    try {
      const res = await fetch(
        `/api/admin/portfolios/${encodeURIComponent(portfolioId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: next }),
        }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to update role');
      setOk('saved');
      setTimeout(() => setOk('idle'), 1200);
    } catch (err) {
      setRole(prev);
      setOk('error');
      setTimeout(() => setOk('idle'), 1800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={role}
        onChange={onChange}
        disabled={saving}
        className="border rounded-2xl px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {ROLES.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      {ok === 'saved' && <span className="text-xs text-green-600">Saved</span>}
      {ok === 'error' && <span className="text-xs text-red-600">Error</span>}
    </div>
  );
}
