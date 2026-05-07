'use client';

import { useState, useEffect } from 'react';

interface Props {
  portfolioId: string;
}

export default function PayoutMiniGauge({ portfolioId }: Props) {
  const year = new Date().getFullYear() - 1;
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/compliance/payout?year=${year}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {});
  }, [portfolioId, year]);

  if (!data || data.net_assets == null) return null;

  const pct = Math.min(100, Math.max(0, Number(data.pct_distributed ?? 0)));
  const met = Number(data.surplus_or_deficit ?? 0) >= 0;

  return (
    <a
      href="/dashboard/compliance"
      className="flex items-center gap-4 rounded-xl border border-black/5 bg-white px-5 py-4 shadow-soft hover:shadow-md transition-shadow"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-neutral-600">{year} Payout (§4942)</span>
          <span className={`text-xs font-semibold ${met ? 'text-green-700' : 'text-red-600'}`}>
            {pct.toFixed(1)}% {met ? '✓' : '⚠'}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${met ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-neutral-400">
          <span>${Number(data.actual_distributions ?? 0).toLocaleString()} distributed</span>
          <span>${Number(data.required_payout ?? 0).toLocaleString()} required</span>
        </div>
      </div>
      <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </a>
  );
}
