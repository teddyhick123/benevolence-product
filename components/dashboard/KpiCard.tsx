'use client';
import React from 'react';

type Format = 'raw' | 'number' | 'currency' | 'percent';

type Props = {
  title: string;
  value: string | number | null | undefined;
  delta?: number | null;           // positive/negative change (e.g., +3.1)
  lastUpdated?: string | null;
  badge?: string | null;
  format?: Format;                  // how to render the value
  currency?: string;                // when format === 'currency' (default USD)
  loading?: boolean;                // show skeleton while loading
  footnote?: string;                // optional small line under delta
  /** allow inline editing when user has rights */
  canEdit?: boolean;
  /** handler for edit click (opens modal/sheet in parent) */
  onEdit?: () => void;
  /** optional custom label for the edit button */
  editLabel?: string;
};

function fmtValue(
  value: Props['value'],
  format: Format = 'raw',
  currency: string = 'USD'
): string {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '—';

  const n = typeof value === 'number' ? value : Number(value as any);
  if (format === 'raw') return String(value);

  if (format === 'number') {
    // friendly K/M/B format
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
  }

  if (format === 'currency') {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(n) < 1000 ? 2 : 0
    }).format(n);
  }

  if (format === 'percent') {
    return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(n);
  }

  return String(value);
}

export default function KpiCard({
  title,
  value,
  delta,
  lastUpdated,
  badge,
  format = 'raw',
  currency = 'USD',
  loading = false,
  footnote,
  canEdit = false,
  onEdit,
  editLabel = 'Edit'
}: Props) {
  const display = fmtValue(value, format, currency);
  const hasDelta = typeof delta === 'number' && isFinite(delta as number);

  return (
    <div className="relative group rounded-2xl bg-white border border-black/5 shadow-soft p-5 flex flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
      {(canEdit && typeof onEdit === 'function') && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white/90 text-neutral-900 shadow-sm hover:shadow px-2.5 py-1 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
          aria-label={editLabel}
          title={editLabel}
        >
          <PencilIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{editLabel}</span>
        </button>
      )}

      {/* Header */}
      <div className="text-sm text-neutral-600 flex items-center justify-between">
        <span className="truncate">{title}</span>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-azure/10 text-azure border border-azure/20">
            {badge}
          </span>
        )}
      </div>

      {/* Value / Skeleton */}
      {loading ? (
        <div className="h-8 w-24 rounded bg-neutral-200 animate-pulse" />
      ) : (
        <div className="text-3xl font-semibold tracking-tight">{display}</div>
      )}

      {/* Delta */}
      {hasDelta && !loading && (
        <div
          className={`text-sm inline-flex items-center gap-1 ${
            (delta as number) >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
          aria-label={(delta as number) >= 0 ? 'Trend up' : 'Trend down'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {(delta as number) >= 0 ? (
              <path d="M13 5l7 7-1.5 1.5L14 9.5V20h-2V9.5l-4.5 4L6 12l7-7z" />
            ) : (
              <path d="M11 19l-7-7 1.5-1.5L10 14.5V4h2v10.5l4.5-4L18 12l-7 7z" />
            )}
          </svg>
          <span className="tabular-nums">{Math.abs(delta as number).toFixed(2)}</span>
          <span className="text-neutral-500">since last period</span>
        </div>
      )}

      {/* Footnote / last updated */}
      {footnote && !loading && <div className="text-xs text-neutral-500">{footnote}</div>}
      {lastUpdated && !loading && (
        <div className="text-xs text-neutral-400">
          Updated {(() => { const d = new Date(lastUpdated); return isNaN(d.getTime()) ? lastUpdated : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })()}
        </div>
      )}
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4 13.5V16h2.5l7.36-7.36-2.5-2.5L4 13.5zm9.85-8.35l1.99 1.99a.5.5 0 010 .7l-1.14 1.14-2.69-2.69 1.14-1.14a.5.5 0 01.7 0z" />
    </svg>
  );
}
