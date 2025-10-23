// app/admin/portfolios/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewPortfolioPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [ownerUserId, setOwnerUserId] = useState(''); // optional: seed first owner
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          base_currency: baseCurrency || 'USD',
          owner_user_id: ownerUserId || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to create portfolio');

      // Navigate to Members management for the new portfolio
      router.replace(`/admin/portfolios/${encodeURIComponent(j.id)}/members`);
    } catch (err: any) {
      setError(err.message || 'Failed to create portfolio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">New Portfolio</h1>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={onCreate} className="card p-4 space-y-4">
        <div className="grid gap-3">
          <label className="text-sm">
            <div className="text-neutral-600 mb-1">Portfolio name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Benevolence Climate Fund I"
              required
              className="border rounded-2xl px-3 py-2 w-full"
            />
          </label>

          <label className="text-sm">
            <div className="text-neutral-600 mb-1">Base currency</div>
            <input
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              className="border rounded-2xl px-3 py-2 w-full"
            />
          </label>

          <label className="text-sm">
            <div className="text-neutral-600 mb-1">Owner user_id (optional)</div>
            <input
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
              placeholder="auth.users.id (UUID)"
              className="border rounded-2xl px-3 py-2 w-full"
            />
            <div className="text-xs text-neutral-500 mt-1">
              If provided, this user will be added as <b>owner</b>.
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create portfolio'}
          </button>
          <a href="/admin/console" className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}