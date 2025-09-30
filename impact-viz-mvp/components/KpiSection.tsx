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
  const { data, error, isLoading, mutate } = useSWR<{ data: any[]; count: number; nextOffset: number | null }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`,
    fetcher
  );

  const [summedKpis, setSummedKpis] = React.useState<KpiRow[]>([]);
  const [sumLoading, setSumLoading] = React.useState(true);

  const usePortfolioSums = mode === 'portfolio-sum';

  // Fetch KPI definitions
  const kpiDefs = data?.data ?? [];

  // For each KPI definition, fetch metric_facts and sum across holdings
  React.useEffect(() => {
    if (!usePortfolioSums || !portfolioId || kpiDefs.length === 0) {
      setSumLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setSumLoading(true);
        const summed: KpiRow[] = [];

        for (const def of kpiDefs) {
          if (!def.metric_code) continue;

          // Fetch all holdings for this portfolio
          const holdingsRes = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/holdings`, { cache: 'no-store' });
          if (!holdingsRes.ok) continue;
          const holdingsJson = await holdingsRes.json();
          const holdings = Array.isArray(holdingsJson?.data) ? holdingsJson.data : [];

          // For each holding, get latest metric_fact value for this metric_code
          let totalValue = 0;
          let latestDate: string | null = null;

          for (const holding of holdings) {
            // Fetch metrics for this holding
            const metricsRes = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/holdings/${holding.id}`, { cache: 'no-store' });
            if (!metricsRes.ok) continue;
            const metricsJson = await metricsRes.json();
            const metrics = Array.isArray(metricsJson?.metric_facts) ? metricsJson.metric_facts : [];

            // Find latest value for this metric_code
            const relevantMetrics = metrics
              .filter((m: any) => m.metric_code === def.metric_code)
              .sort((a: any, b: any) => {
                const dateA = a.period_end || a.period_start;
                const dateB = b.period_end || b.period_start;
                return dateB ? dateB.localeCompare(dateA || '') : -1;
              });

            if (relevantMetrics.length > 0) {
              const latest = relevantMetrics[0];
              totalValue += Number(latest.value) || 0;
              const metricDate = latest.period_end || latest.period_start;
              if (!latestDate || (metricDate && metricDate > latestDate)) {
                latestDate = metricDate;
              }
            }
          }

          summed.push({
            id: def.id,
            portfolio_id: portfolioId,
            label: def.display_name || prettifyMetric(def.metric_code),
            display_name: def.display_name,
            metric_code: def.metric_code,
            value: totalValue,
            unit: def.unit || null,
            as_of: latestDate,
            period_start: null,
            period_end: latestDate,
            notes: def.description || null,
          });
        }

        if (alive) {
          setSummedKpis(summed);
          setSumLoading(false);
        }
      } catch (err) {
        console.error('Error summing KPIs:', err);
        if (alive) setSumLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [portfolioId, usePortfolioSums, kpiDefs.length]);

  const rows = usePortfolioSums ? summedKpis : kpiDefs.map((def: any) => ({
    id: def.id,
    portfolio_id: portfolioId,
    label: def.display_name || prettifyMetric(def.metric_code),
    display_name: def.display_name,
    metric_code: def.metric_code,
    value: def.latest?.value ?? null,
    unit: def.latest?.unit ?? def.unit ?? null,
    as_of: def.latest?.period_end ?? null,
    period_start: def.latest?.period_start ?? null,
    period_end: def.latest?.period_end ?? null,
    notes: def.description ?? null,
  }));

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
        subtitle={usePortfolioSums ? 'Portfolio totals (sum of latest KPIs across holdings)' : 'Key performance indicators compiled across all holdings'}
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