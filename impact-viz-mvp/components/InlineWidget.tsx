'use client';

import { Suspense, lazy, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import widget renderers
const KpiTrend = lazy(() => import('./vis/KpiTrend'));
const RadialProgress = lazy(() => import('./vis/RadialProgress'));
const D3JsonWidget = lazy(() => import('./vis/D3JsonWidget'));
const HoldingsPieWidget = dynamic(() => import('./vis/HoldingsPieWidget'), { ssr: false });
const PeopleGridWidget = dynamic(() => import('./vis/PeopleGridWidget'), { ssr: false });

// Auto-fetching renderer for people grid
function PeopleGridAutoRenderer({ portfolioId, title, config }: { portfolioId: string; title?: string | null; config?: any }) {
  const metric = String(config?.metric_code || '').trim();
  const mode = (config?.mode || 'sum') as 'latest' | 'sum';
  const windowStr = String(config?.window || '12m');
  const perUnit = config?.perUnit != null ? Number(config.perUnit) : 10;
  const iconSize = config?.iconSize != null ? Number(config.iconSize) : 16;
  const color = config?.color;
  const target = config?.target != null ? Number(config.target) : undefined;

  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }
  if (total == null) {
    return <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600">Loading…</div>;
  }
  return <PeopleGridWidget total={total} perUnit={perUnit} iconSize={iconSize} color={color} target={target} title={effectiveTitle} />;
}

// Auto-fetching renderer for holdings pie
function HoldingsPieAutoRenderer({ portfolioId, title, config }: { portfolioId: string; title?: string | null; config?: any }) {
  const size = Number(config?.size ?? 320);
  const innerRadius = Number(config?.innerRadius ?? 48);
  const showLegend = config?.showLegend ?? true;
  const legendMaxHeight = Number(config?.legendMaxHeight ?? 240);
  const nameField = String(config?.nameField || 'name');
  const valueFieldPrimary = String(config?.valueFieldPrimary || 'funds_allocated');
  const valueFieldFallback = String(config?.valueFieldFallback || 'nav');
  const endpoint = config?.endpoint || `/api/portfolio/${portfolioId}/holdings`;

  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

        const aggregated: Record<string, number> = {};
        for (const item of items) {
          const name = String(item[nameField] || 'Unknown');
          const val = Number(item[valueFieldPrimary] ?? item[valueFieldFallback] ?? 0);
          aggregated[name] = (aggregated[name] || 0) + val;
        }

        const pieData = Object.entries(aggregated).map(([name, value]) => ({ label: name, value }));
        if (alive) setData(pieData);
      } catch (e: any) {
        if (alive) { setError('Failed to load holdings data'); setData([]); }
      }
    })();
    return () => { alive = false; };
  }, [portfolioId, endpoint, nameField, valueFieldPrimary, valueFieldFallback]);

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }
  if (data.length === 0) {
    return <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-neutral-600">Loading…</div>;
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

// Widget registry - maps widget types to components
const WIDGET_REGISTRY: Record<string, any> = {
  kpi_trend: KpiTrend,
  radial_progress: RadialProgress,
  d3_json: D3JsonWidget,
  holdings_pie_auto: HoldingsPieAutoRenderer,
  people_grid_auto: PeopleGridAutoRenderer,
};

type WidgetData = {
  id: string;
  portfolio_id?: string;
  holding_id?: string;
  type: string;
  title: string | null;
  config: any | null;
  is_preview?: boolean;
};

type InlineWidgetProps = {
  widget: WidgetData;
  portfolioId: string;
};

export default function InlineWidget({ widget, portfolioId }: InlineWidgetProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveToDashboard = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/widgets/save-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: widget.type,
          title: widget.title,
          config: widget.config,
          holding_id: widget.holding_id,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save widget');
      }

      setSaved(true);
    } catch (error) {
      alert('Failed to save widget to dashboard');
    } finally {
      setSaving(false);
    }
  };
  const WidgetComponent = WIDGET_REGISTRY[widget.type];

  if (!WidgetComponent) {
    return (
      <div className="my-4 p-4 bg-neutral-100 rounded-lg border border-neutral-200">
        <div className="text-sm text-neutral-600">
          Widget type &ldquo;{widget.type}&rdquo; is not yet supported for inline display.
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          Type: {widget.type} | Title: {widget.title}
        </div>
      </div>
    );
  }

  // Auto-fetching renderers don't need Suspense (they handle their own loading)
  const needsSuspense = !['holdings_pie_auto', 'people_grid_auto'].includes(widget.type);

  const widgetElement = (
    <WidgetComponent
      portfolioId={portfolioId}
      holdingId={widget.holding_id}
      title={widget.title || ''}
      config={widget.config || {}}
    />
  );

  // d3_json widgets need a fixed height container since they use h-full
  const needsFixedHeight = widget.type === 'd3_json';

  return (
    <div className="my-6 bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className={`p-4 ${needsFixedHeight ? 'h-[400px]' : ''}`}>
        {needsSuspense ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-4 border-azure/30 border-t-azure rounded-full animate-spin"></div>
                <span className="ml-3 text-sm text-neutral-600">Loading visualization...</span>
              </div>
            }
          >
            {widgetElement}
          </Suspense>
        ) : (
          widgetElement
        )}
      </div>

      {/* Save to Dashboard button for preview widgets */}
      {widget.is_preview && !saved && (
        <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-neutral-600">
            This is a preview. Save it to add to your dashboard.
          </div>
          <button
            onClick={handleSaveToDashboard}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-azure text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save to Dashboard
              </>
            )}
          </button>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="border-t border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-700">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Saved to dashboard!</span>
        </div>
      )}
    </div>
  );
}
