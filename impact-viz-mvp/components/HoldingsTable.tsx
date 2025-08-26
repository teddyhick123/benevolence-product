'use client';
import React, { useMemo, useState, useCallback } from 'react';

type SimpleRow = {
  name?: string;
  holding_name?: string;
  nav?: number | null;
  asset_class?: string | null;
  as_of_date?: string | null;
  last_updated?: string | null;
  status?: string | null;
  sector?: string | null;
  country?: string | null;
  investees?: { display_name?: string | null; sector?: string | null; country?: string | null } | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(Number(n))) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}

// Colored tag palette and stable hashing for label -> color mapping
const TAG_PALETTE = [
  { bg: 'bg-azure/10', text: 'text-azure', border: 'border-azure/20' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20' },
  { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/20' },
  { bg: 'bg-rose-500/10', text: 'text-rose-600', border: 'border-rose-500/20' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600', border: 'border-cyan-500/20' },
];
function pickTagClass(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const { bg, text, border } = TAG_PALETTE[hash % TAG_PALETTE.length];
  return `${bg} ${text} ${border}`;
}

function Pill({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  const label = String(children);
  const color = pickTagClass(label);
  return (
    <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-xs border ${color}`}>
      {label}
    </span>
  );
}

/**
 * HoldingsTable
 * - Accepts rows from our API or a simple array and normalizes them
 * - Styled to match crème + grey-azure theme
 */
export default function HoldingsTable({ rows }: { rows: SimpleRow[] }) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'nav', direction: 'desc' });

  const data = useMemo(() => {
    const arr = Array.isArray(rows) ? rows : [];
    const normalized = arr.map((r) => {
      const name = r.name || r.holding_name || r.investees?.display_name || '—';
      const nav = r.nav ?? null;
      const assetClass = r.asset_class ?? '—';
      const asOf = r.as_of_date || r.last_updated || '—';
      const sector = r.sector ?? r.investees?.sector ?? null;
      const country = r.country ?? r.investees?.country ?? null;
      const status = r.status ?? '—';
      return { name, nav, assetClass, asOf, sector, country, status };
    });

    const { key, direction } = sortConfig;

    normalized.sort((a, b) => {
      let aVal = a[key as keyof typeof a];
      let bVal = b[key as keyof typeof b];

      // Handle null or undefined values
      if (aVal == null) aVal = direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      if (bVal == null) bVal = direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

      // For nav, compare as numbers
      if (key === 'nav') {
        return direction === 'asc' ? (Number(aVal) - Number(bVal)) : (Number(bVal) - Number(aVal));
      }

      // For other fields, compare as strings, case insensitive
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return normalized;
  }, [rows, sortConfig]);

  const requestSort = useCallback((key: string) => {
    setSortConfig((current) => {
      if (current.key === key) {
        // Toggle direction
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const getSortIndicator = (key: string) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  if (!data.length) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600">
        No holdings yet. Once you upload a report, holdings will appear here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white">
            <tr className="border-b border-black/5">
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('name')}
              >
                Holding{getSortIndicator('name')}
              </th>
              <th
                className="text-right px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('nav')}
              >
                NAV{getSortIndicator('nav')}
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('assetClass')}
              >
                Asset Class{getSortIndicator('assetClass')}
              </th>
              <th className="text-left px-3 py-2 font-medium text-neutral-700">
                Tags
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('asOf')}
              >
                As of{getSortIndicator('asOf')}
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('status')}
              >
                Status{getSortIndicator('status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className="border-b border-black/5 hover:bg-azure/5 transition">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.nav)}</td>
                <td className="px-3 py-2">{r.assetClass}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Pill>{r.sector}</Pill>
                    <Pill>{r.country}</Pill>
                  </div>
                </td>
                <td className="px-3 py-2">{r.asOf}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
