'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OrgType } from '@/lib/types/org';

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'private_foundation', label: 'Private Foundation' },
  { value: 'daf', label: 'Donor-Advised Fund' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'operating_nonprofit', label: 'Operating Nonprofit' },
  { value: 'other', label: 'Other' },
];

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [ein, setEin] = useState('');
  const [orgType, setOrgType] = useState<OrgType | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ein: ein || undefined,
          org_type: orgType || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to create organization');
      router.replace(`/admin/org/${j.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">New Organization</h1>

      {error && (
        <div className="card p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">{error}</div>
      )}

      <form onSubmit={onCreate} className="card p-4 space-y-4">
        <div className="grid gap-3">
          <label className="text-sm">
            <div className="text-neutral-600 mb-1">Organization name <span className="text-rose-500">*</span></div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Ashford Family Foundation"
              required
              className="border rounded-2xl px-3 py-2 w-full"
            />
          </label>

          <label className="text-sm">
            <div className="text-neutral-600 mb-1">EIN (optional)</div>
            <input
              value={ein}
              onChange={e => setEin(e.target.value)}
              placeholder="XX-XXXXXXX"
              className="border rounded-2xl px-3 py-2 w-full"
            />
          </label>

          <label className="text-sm">
            <div className="text-neutral-600 mb-1">Organization type</div>
            <select
              value={orgType}
              onChange={e => setOrgType(e.target.value as OrgType | '')}
              className="border rounded-2xl px-3 py-2 w-full bg-white"
            >
              <option value="">— Select type —</option>
              {ORG_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create organization'}
          </button>
          <Link
            href="/admin/org"
            className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
