'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import SectionHeader from '@/components/ui/SectionHeader';
import KpiCard from '@/components/dashboard/KpiCard';
import EditKpiModal, { KpiInput } from '@/components/dashboard/EditKpiModal';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type KpiRow = {
  metric_code: string;           // Primary identifier (was id)
  portfolio_id: string;
  metric_name: string;          // From metrics table
  display_name?: string | null; // Org-level KPI display name from kpi_definitions
  value: number | null;
  unit: string | null;
  period_end: string | null;    // ISO datetime
  target_value?: number | null;
  target_date?: string | null;
  progress_percentage?: number | null;
  notes?: string | null;
  delta?: number | null;        // % change vs previous period
  // Legacy fields for backward compatibility
  label?: string;
  as_of?: string | null;
};

export default function KpiSection({ portfolioId, canEdit = false, initialSums, mode, asOf }: {
  portfolioId: string;
  canEdit?: boolean;
  initialSums?: Array<{ metric_code: string; total_value: number | null; latest_period: string | null }>;
  mode?: 'portfolio-sum' | 'raw';
  asOf?: string;
}) {
  const apiUrl = asOf
    ? `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis?as_of=${asOf}`
    : `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`;

  const { data, error, isLoading, mutate } = useSWR<{ data: KpiRow[]; count: number; nextOffset: number | null }>(
    apiUrl,  // SWR key changes when asOf changes → triggers refetch
    fetcher
  );

  // When asOf is set, ignore initialSums (they're always "latest")
  const usePortfolioSums = !asOf && mode === 'portfolio-sum' && Array.isArray(initialSums) && initialSums.length > 0;

  const rows = data?.data ?? [];
  const nameByCode = new Map<string, string>();
  for (const r of rows) {
    const chosen = (r.display_name ?? r.label ?? '').trim();
    if (r.metric_code && chosen) nameByCode.set(r.metric_code, chosen);
  }

  const sumRows: KpiRow[] = usePortfolioSums
    ? initialSums!.map((s, i) => ({
        metric_code: s.metric_code,
        portfolio_id: portfolioId,
        metric_name: nameByCode.get(s.metric_code) || prettifyMetric(s.metric_code),
        display_name: nameByCode.get(s.metric_code) || null,
        value: s.total_value ?? null,
        unit: null,
        period_end: s.latest_period,
        // Legacy compatibility
        label: nameByCode.get(s.metric_code) || prettifyMetric(s.metric_code),
        as_of: s.latest_period,
      }))
    : [];

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KpiInput | null>(null);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: KpiRow) => {
    setEditing({
      id: row.metric_code, // Use metric_code as id for editing
      label: row.display_name || row.metric_name || row.label || '',
      metric_code: row.metric_code,
      value: row.value ?? undefined,
      unit: row.unit ?? undefined,
      as_of: row.as_of || row.period_end,
      period_start: null,
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
    const name = (k.metric_name ?? '').trim();
    if (name) return name;
    const lbl = (k.label ?? '').trim();
    if (lbl) return lbl;
    const code = (k.metric_code ?? '').trim();
    if (code) return prettifyMetric(code);
    return 'KPI';
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Key Performance Indicators"
        subtitle={usePortfolioSums ? 'Lifetime portfolio totals' : 'Key performance indicators compiled across all holdings'}
        canEdit={canEdit}
        onEdit={onAdd}
        editLabel="Add KPI"
      />

      {usePortfolioSums ? (
        sumRows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600">
            No KPIs yet.
          </div>
        ) : (
          <KpiCarousel
            kpis={sumRows}
            getTitle={getTitle}
            determineFormat={determineFormat}
            canEdit={false}
            onEdit={() => {}}
          />
        )
      ) : isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500 h-[280px] flex items-center justify-center">
          Loading KPIs…
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 p-6 text-sm h-[280px] flex items-center justify-center">
          {error?.message || 'Failed to load KPIs'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600 h-[280px] flex flex-col items-center justify-center">
          <div>No KPIs yet.</div>
          {canEdit ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5"
              >
                Add KPI
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <KpiCarousel
          kpis={rows}
          getTitle={getTitle}
          determineFormat={determineFormat}
          canEdit={canEdit}
          onEdit={onEdit}
        />
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

/**
 * KpiCarousel - Horizontally scrollable KPI carousel
 * Shows KPIs in a horizontal scrolling row with smooth snap behavior
 */
function KpiCarousel({
  kpis,
  getTitle,
  determineFormat,
  canEdit,
  onEdit,
}: {
  kpis: KpiRow[];
  getTitle: (k: KpiRow) => string;
  determineFormat: (k: KpiRow) => 'raw' | 'number' | 'currency' | 'percent';
  canEdit: boolean;
  onEdit: (k: KpiRow) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      const cardWidth = scrollContainerRef.current.querySelector('.kpi-card')?.clientWidth || 300;
      scrollContainerRef.current.scrollBy({ left: -(cardWidth + 12), behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const cardWidth = scrollContainerRef.current.querySelector('.kpi-card')?.clientWidth || 300;
      scrollContainerRef.current.scrollBy({ left: cardWidth + 12, behavior: 'smooth' });
    }
  };

  if (kpis.length === 0) {
    return null;
  }

  // If only 1-3 KPIs, show them all in a grid without carousel
  if (kpis.length <= 3) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <KpiCard
              key={k.metric_code}
              title={getTitle(k)}
              value={k.value ?? undefined}
              lastUpdated={k.as_of || k.period_end || undefined}
              format={determineFormat(k)}
              delta={k.delta ?? undefined}
              canEdit={canEdit}
              onEdit={() => onEdit(k)}
              footnote={k.notes ?? undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-4 space-y-3">
      {/* Navigation Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={scrollLeft}
            aria-label="Scroll left"
            className="p-2 rounded-lg border border-black/10 bg-white hover:bg-neutral-50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 will-change-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={scrollRight}
            aria-label="Scroll right"
            className="p-2 rounded-lg border border-black/10 bg-white hover:bg-neutral-50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 will-change-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-xs text-neutral-600 ml-2">
            {kpis.length} KPIs
          </span>
        </div>
      </div>

      {/* Horizontally Scrollable KPI Cards */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-neutral-300 scrollbar-track-transparent hover:scrollbar-thumb-neutral-400"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flex gap-3 pb-2">
          {kpis.map((k) => (
            <div key={k.metric_code} className="kpi-card flex-none w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]">
              <KpiCard
                title={getTitle(k)}
                value={k.value ?? undefined}
                lastUpdated={k.as_of || k.period_end || undefined}
                format={determineFormat(k)}
                delta={k.delta ?? undefined}
                canEdit={canEdit}
                onEdit={() => onEdit(k)}
                footnote={k.notes ?? undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}