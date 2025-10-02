'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import KpiTrend from '@/components/vis/KpiTrend';
import SectorEmissionsBar from '@/components/vis/SectorEmissionsBar';
import TargetGauge from '@/components/vis/TargetGauge';

// Lazy-load heavy D3 widget and disable SSR for it
const D3JsonWidget = dynamic(() => import('@/components/vis/D3JsonWidget'), { ssr: false });
const HoldingsPieWidget = dynamic(() => import('@/components/vis/HoldingsPieWidget'), { ssr: false });
const PeopleGridWidget = dynamic(() => import('@/components/vis/PeopleGridWidget'), { ssr: false });

// Wrapper renderers adapt (title, config) to each widget's expected props shape
function HoldingsPieRenderer({ title, config }: { title?: string | null; config?: any }) {
  const data = Array.isArray(config?.data) ? config.data : [];
  const size = Number(config?.size ?? 320);
  const innerRadius = Number(config?.innerRadius ?? 48);
  const showLegend = config?.showLegend ?? true;
  const legendMaxHeight = Number(config?.legendMaxHeight ?? 240);
  return (
    <div className="space-y-2">
      {title ? <div className="text-sm font-medium text-neutral-800">{title}</div> : null}
      <HoldingsPieWidget
        data={data}
        size={size}
        innerRadius={innerRadius}
        showLegend={showLegend}
        legendMaxHeight={legendMaxHeight}
      />
    </div>
  );
}

function PeopleGridRenderer({ title, config }: { title?: string | null; config?: any }) {
  const total = Number(config?.total ?? 0);
  const perUnit = config?.perUnit != null ? Number(config.perUnit) : 10;
  const iconSize = config?.iconSize != null ? Number(config.iconSize) : 16;
  const color = config?.color; // optional, defaults inside widget
  const target = config?.target != null ? Number(config.target) : undefined;
  return (
    <PeopleGridWidget total={total} perUnit={perUnit} iconSize={iconSize} color={color} target={target} title={title ?? 'People Helped'} />
  );
}

function PeopleGridAutoRenderer({ portfolioId, title, config }: { portfolioId: string; title?: string | null; config?: any }) {
  const metric = String(config?.metric_code || '').trim();
  const mode = (config?.mode || 'sum') as 'latest' | 'sum';
  const windowStr = String(config?.window || '12m');
  const perUnit = config?.perUnit != null ? Number(config.perUnit) : 10;
  const iconSize = config?.iconSize != null ? Number(config.iconSize) : 16;
  const color = config?.color; // optional, defaults inside widget
  const target = config?.target != null ? Number(config.target) : undefined;

  const [total, setTotal] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        if (!metric) { setTotal(0); setError('Missing metric_code'); return; }
        const qs = new URLSearchParams({ metric: metric, window: windowStr });
        const res = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpi-series?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const series: Array<{ date: string; value: number }> = Array.isArray(json?.series) ? json.series : [];
        let t = 0;
        if (mode === 'latest') {
          const last = series[series.length - 1];
          t = last ? Number(last.value) : 0;
        } else {
          t = series.reduce((s, d) => s + Number(d?.value || 0), 0);
        }
        if (alive) setTotal(Math.max(0, t));
      } catch (e: any) {
        if (alive) { setError('Failed to load metric'); setTotal(0); }
      }
    })();
    return () => { alive = false; };
  }, [portfolioId, metric, mode, windowStr]);

  const effectiveTitle = title ?? (metric ? `People Helped — ${metric}` : 'People Helped');

  return (
    <div className="w-full h-full">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 w-full h-full">{error}</div>
      ) : total == null ? (
        <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600 w-full h-full">Loading…</div>
      ) : (
        <PeopleGridWidget total={total} perUnit={perUnit} iconSize={iconSize} color={color} target={target} title={effectiveTitle} />
      )}
    </div>
  );
}

// Auto renderer: fetch holdings -> aggregate -> render pie
function HoldingsPieAutoRenderer({
  portfolioId,
  title,
  config,
}: {
  portfolioId: string;
  title?: string | null;
  config?: any;
}) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Array<{ label: string; value: number }>>([]);

  const size = Number(config?.size ?? 320);
  const innerRadius = Number(config?.innerRadius ?? 48);
  const showLegend = config?.showLegend ?? true;
  const legendMaxHeight = Number(config?.legendMaxHeight ?? 240);

  // mapping config (in case API field names differ)
  const nameField: string = String(config?.nameField ?? 'name');
  const valueFieldPrimary: string = String(config?.valueFieldPrimary ?? 'funds_allocated');
  const valueFieldFallback: string = String(config?.valueFieldFallback ?? 'nav');
  const endpoint: string =
    config?.endpoint ?? `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings`;

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        const m = new Map<string, number>();

        const getName = (r: any) =>
          r?.[nameField] ?? r?.holding_name ?? r?.investees?.[0]?.display_name ?? '—';

        const getVal = (r: any) => {
          const primary = Number(r?.[valueFieldPrimary]);
          if (Number.isFinite(primary) && primary > 0) return primary;
          const fallback = Number(r?.[valueFieldFallback]);
          if (Number.isFinite(fallback) && fallback > 0) return fallback;
          return 0;
        };

        for (const r of rows) {
          const label = String(getName(r));
          const v = getVal(r);
          if (!Number.isFinite(v) || v <= 0) continue;
          m.set(label, (m.get(label) ?? 0) + v);
        }

        const pieData = Array.from(m.entries())
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);

        if (alive) setData(pieData);
      } catch (err: any) {
        if (alive) setError(err?.message ?? 'Failed to load holdings');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [endpoint, nameField, valueFieldPrimary, valueFieldFallback, portfolioId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {title ? <div className="text-sm font-medium text-neutral-800">{title}</div> : null}
        <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        {title ? <div className="text-sm font-medium text-neutral-800">{title}</div> : null}
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="space-y-2">
        {title ? <div className="text-sm font-medium text-neutral-800">{title}</div> : null}
        <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600">No holdings to visualize yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title ? <div className="text-sm font-medium text-neutral-800">{title}</div> : null}
      <HoldingsPieWidget
        data={data}
        size={size}
        innerRadius={innerRadius}
        showLegend={showLegend}
        legendMaxHeight={legendMaxHeight}
      />
    </div>
  );
}

const REGISTRY: Record<string, any> = {
  kpi_trend: KpiTrend,
  emissions_bar: SectorEmissionsBar,
  d3_json: D3JsonWidget,
  holdings_pie: HoldingsPieRenderer,
  holdings_pie_auto: HoldingsPieAutoRenderer,
  target_gauge: TargetGauge,
  people_grid: PeopleGridRenderer,
  people_grid_auto: PeopleGridAutoRenderer,
};

export type CarouselItem = {
  // Legacy ID (still supported): 'kpi_waci', 'kpi_femiss', 'sector_emissions'
  id: string;
  label: string;
  // New widget model (optional). If present, takes precedence over legacy id mapping.
  type?: 'kpi_trend' | 'emissions_bar' | 'd3_json' | 'holdings_pie' | 'holdings_pie_auto' | 'target_gauge' | 'people_grid' | 'people_grid_auto' | string;
  title?: string | null;
  config?: any;
};

type Props = {
  items: CarouselItem[];
  portfolioId: string;
  initialId?: string;
  autoPlayMs?: number;        // default 8000
  onChange?: (id: string) => void;

  // editing affordances (shown to editors/owners/admin)
  canEdit?: boolean;
  onEdit?: () => void;
  editLabel?: string; // default: 'Edit widgets'
};

/**
 * VisualCarousel: smooth, accessible carousel for portfolio visualizations.
 * - Keyboard support (←/→, Home/End)
 * - Autoplay with hover/focus pause
 * - Swipe on touch devices
 * - Pills to jump to a specific viz
 */
export default function VisualCarousel({ items, portfolioId, initialId, autoPlayMs = 8000, onChange, canEdit = false, onEdit, editLabel = 'Edit widgets' }: Props) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const startIndex = useMemo(() =>
    hasItems ? Math.max(0, items.findIndex(i => i.id === (initialId || ''))) : 0,
  [hasItems, items, initialId]);

  const [index, setIndex] = useState(startIndex === -1 ? 0 : startIndex);
  const [isPaused, setPaused] = useState(false);
  const wrap = useCallback((n: number) => (n + items.length) % items.length, [items.length]);
  const go = useCallback((n: number) => {
    const next = wrap(n);
    setIndex(next);
    onChange?.(items[next].id);
  }, [items, onChange, wrap]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  // Autoplay with hover/focus pause
  useEffect(() => {
    if (!hasItems || autoPlayMs <= 0 || isPaused) return;
    const t = setInterval(next, autoPlayMs);
    return () => clearInterval(t);
  }, [hasItems, autoPlayMs, isPaused, next]);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      dx < 0 ? next() : prev();
    }
    touchStartX.current = null;
  };

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
  };

  if (!hasItems) {
    return (
      <div className="card p-4 text-sm text-neutral-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
        No visualizations configured.
      </div>
    );
  }

  return (
    <div
      className="card p-4 space-y-3 min-w-0 w-full select-none overflow-hidden"
      style={{ minHeight: '400px' }}
      role="region"
      aria-label="Portfolio visualizations carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous visualization"
            className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next visualization"
            className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Slides */}
      <CarouselSlides index={index}>
        {items.map((it, i) => (
          <div key={it.id} className="w-full flex items-center justify-center min-w-0">
            {/* Only mount neighbors for perf */}
            {Math.abs(i - index) <= 1 || Math.abs(i - index) >= items.length - 1 ? (() => {
              // Prefer new registry-based rendering when type is provided
              if (it.type) {
                const Comp = REGISTRY[it.type];
                if (Comp) {
                  return <Comp portfolioId={portfolioId} title={it.title ?? it.label} config={(it as any).config || {}} />;
                }
                return <div className="card p-4 text-sm text-neutral-600">Unknown widget type: {it.type}</div>;
              }
              // Legacy id mapping fallback
              if (it.id === 'kpi_waci') {
                return <KpiTrend portfolioId={portfolioId} metric="WACI" title="WACI trend" />;
              }
              if (it.id === 'kpi_femiss') {
                return <KpiTrend portfolioId={portfolioId} metric="FEMISS" title="FEMISS trend" />;
              }
              if (it.id === 'sector_emissions') {
                return <SectorEmissionsBar portfolioId={portfolioId} title={it.title ?? it.label} config={(it as any).config || {}} />;
              }
              return <div className="card p-4 text-sm text-neutral-600">Unknown widget: {it.label}</div>;
            })() : null}
          </div>
        ))}
      </CarouselSlides>

      {/* Pills */}
      <div className="flex flex-wrap gap-1 pt-1">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => go(i)}
            aria-current={i === index ? 'true' : 'false'}
            className={`text-xs px-2 py-1 rounded-full border transition-colors transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none ${
              i === index ? 'bg-azure/10 text-azure border-azure/20' : 'border-black/10 hover:bg-white'
            }`}
          >
            {it.title ?? it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Slides wrapper with smooth translate/opacity transitions.
 * Keeps DOM simple and avoids layout thrash.
 */
function CarouselSlides({ index, children }: { index: number; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-hidden px-0" aria-live="polite">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{
          transform: `translate3d(-${index * (width || 1)}px, 0, 0)`,
          width: `${React.Children.count(children) * (width || 1)}px`,
          willChange: 'transform'
        }}
      >
        {React.Children.map(children, (child, i) => (
          <div
            className={`shrink-0 transition-opacity duration-500 ${i === index ? 'opacity-100' : 'opacity-75'}`}
            style={{ flex: `0 0 ${width || 1}px`, width: width || 1 }}
            aria-hidden={i !== index}
          >
            {child}
          </div>
        ))}
      </div>
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