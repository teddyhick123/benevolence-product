'use client';

import * as React from 'react';
import useSWR from 'swr';
import SectionHeader from '@/components/SectionHeader';
import KpiCard from '@/components/KpiCard';
import EditKpiModal, { KpiInput } from '@/components/EditKpiModal';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type KpiRow = {
  id: string;
  portfolio_id: string;
  label: string;
  display_name?: string | null;
  metric_code: string | null;
  value: number | null;
  unit: string | null;
  as_of: string | null;        // ISO datetime
  period_start: string | null;  // ISO datetime
  period_end: string | null;    // ISO datetime
  notes: string | null;
};

export default function KpiSection({ portfolioId, canEdit = false, initialSums, mode }: { portfolioId: string; canEdit?: boolean; initialSums?: Array<{ metric_code: string; total_value: number | null; latest_period: string | null }>; mode?: 'portfolio-sum' | 'raw'; }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: KpiRow[]; count: number; nextOffset: number | null }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series`,
    fetcher
  );

  const usePortfolioSums = mode === 'portfolio-sum' && Array.isArray(initialSums) && initialSums.length > 0;

  const rows = data?.data ?? [];
  const nameByCode = new Map<string, string>();
  for (const r of rows) {
    const chosen = (r.display_name ?? r.label ?? '').trim();
    if (r.metric_code && chosen) nameByCode.set(r.metric_code, chosen);
  }

  const sumRows: KpiRow[] = usePortfolioSums
    ? initialSums!.map((s, i) => ({
        id: `sum-${s.metric_code}-${i}`,
        portfolio_id: portfolioId,
        label: nameByCode.get(s.metric_code) || prettifyMetric(s.metric_code),
        display_name: nameByCode.get(s.metric_code) || null,
        metric_code: s.metric_code,
        value: s.total_value ?? null,
        unit: null,
        as_of: s.latest_period,
        period_start: null,
        period_end: null,
        notes: null,
      }))
    : [];

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KpiInput | null>(null);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: KpiRow) => {
    setEditing({
      id: row.id,
      label: row.label,
      metric_code: row.metric_code ?? undefined,
      value: row.value ?? undefined,
      unit: row.unit ?? undefined,
      as_of: row.as_of,
      period_start: row.period_start,
      period_end: row.period_end,
      notes: row.notes ?? undefined,
    });
    setOpen(true);
  };

  const onChanged = () => mutate();

  function prettifyMetric(code?: string | null) {
    const c = (code ?? '').trim();
    if (!c) return '';
    return toTitleCase(c.replaceAll('_', ' ').replace(/\s+/g, ' '));
  }

  function toTitleCase(s: string) {
    return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }
  function getTitle(k: KpiRow): string {
    const dn = (k.display_name ?? '').trim();
    if (dn) return dn;
    const lbl = (k.label ?? '').trim();
    const code = (k.metric_code ?? '').trim();

    const norm = (s: string) => s.replace(/[\s_]+/g, ' ').trim().toLowerCase();

    if (lbl && code && norm(lbl) === norm(code)) {
      return prettifyMetric(code);
    }
    if (lbl) return lbl;
    if (code) return prettifyMetric(code);
    return 'KPI';
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="KPIs"
        subtitle={usePortfolioSums ? 'Lifetime portfolio totals' : 'Key performance indicators compiled across all holdings'}
        canEdit={canEdit}
        onEdit={onAdd}
        editLabel="Add KPI"
      />

      {usePortfolioSums ? (
        sumRows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
            No KPIs yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sumRows.map((k) => (
              <KpiCard
                key={k.id}
                title={getTitle(k)}
                value={k.value ?? undefined}
                lastUpdated={k.as_of ?? undefined}
                format={determineFormat(k)}
                canEdit={false}
                onEdit={undefined as any}
                footnote={k.notes ?? undefined}
              />
            ))}
          </div>
        )
      ) : isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">Loading KPIs…</div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 p-6 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">{error?.message || 'Failed to load KPIs'}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          No KPIs yet.
          {canEdit ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              >
                Add KPI
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((k) => (
            <KpiCard
              key={k.id}
              title={getTitle(k)}
              value={k.value ?? undefined}
              lastUpdated={k.as_of ?? undefined}
              format={determineFormat(k)}
              canEdit={canEdit}
              onEdit={() => onEdit(k)}
              footnote={k.notes ?? undefined}
            />
          ))}
        </div>
      )}

      <EditKpiModal
        portfolioId={portfolioId}
        initial={editing}
        open={open}
        onClose={() => setOpen(false)}
        onChanged={onChanged}
      />
    </section>
  );
}

function determineFormat(k: KpiRow): 'raw' | 'number' | 'currency' | 'percent' {
  // Heuristic: use percent if unit looks like '%'; currency if unit contains '$' or starts with common currency code; number if value is numeric & unit blank; else raw
  const u = (k.unit || '').trim();
  if (u === '%' || /percent/i.test(u)) return 'percent';
  if (u.startsWith('$') || /^(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY)\b/i.test(u)) return 'currency';
  if (typeof k.value === 'number') return 'number';
  return 'raw';
}