'use client';

import { useState } from 'react';

export default function LoadDemoDataButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; portfolioId?: string; error?: string } | null>(null);

  async function handleLoad() {
    if (!confirm('This will load demo data into the database. Continue?')) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/demo/load', { method: 'POST' });
      const json = await res.json();
      setResult(json);
    } catch {
      setResult({ error: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleLoad}
        disabled={loading}
        className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm text-sm transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Load Demo Data'}
      </button>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
          {result.ok
            ? `Demo data loaded. Portfolio: ${result.portfolioId}`
            : result.error ?? 'Unknown error'}
        </p>
      )}
    </div>
  );
}
