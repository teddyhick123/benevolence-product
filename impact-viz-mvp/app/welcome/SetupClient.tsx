'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrgType } from '@/lib/types/org';

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'private_foundation', label: 'Private Foundation' },
  { value: 'daf', label: 'Donor-Advised Fund' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'operating_nonprofit', label: 'Operating Nonprofit' },
  { value: 'other', label: 'Other' },
];

export default function SetupClient() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrgType | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), org_type: orgType || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create organization. Please try again.');
        return;
      }
      const dest = data.portfolio_id
        ? `/dashboard?portfolio_id=${encodeURIComponent(data.portfolio_id)}`
        : '/dashboard';
      router.replace(dest);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-8 space-y-5">
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700" htmlFor="org-name">
          Organization name
        </label>
        <input
          id="org-name"
          type="text"
          placeholder="e.g. Smithfield Family Foundation"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoFocus
          className="w-full border border-black/10 rounded-2xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-azure/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700" htmlFor="org-type">
          Organization type <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <select
          id="org-type"
          value={orgType}
          onChange={e => setOrgType(e.target.value as OrgType | '')}
          className="w-full border border-black/10 rounded-2xl px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-azure/30"
        >
          <option value="">Select a type…</option>
          {ORG_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-rose-600" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {busy ? 'Setting up your workspace…' : 'Get started'}
      </button>
    </form>
  );
}
