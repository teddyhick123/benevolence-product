'use client';

import * as React from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import CreateWidgetModal from './CreateWidgetModal';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type WidgetRow = {
  id: string;
  portfolio_id?: string;
  holding_id?: string;
  type: string;        // e.g., 'kpi_trend' | 'emissions_bar'
  title: string | null;
  config: any | null;  // arbitrary JSON config consumed by the renderer
  position: number;    // ordering in the carousel/section
};

export type EditWidgetsModalProps = {
  portfolioId: string;
  holdingId?: string; // If provided, creates holding-specific widgets
  open: boolean;
  onClose: () => void;
  onChanged?: () => void; // signal parent to refetch carousel items
};

const WIDGET_TYPES: { value: string; label: string; hint: string; example: object }[] = [
  {
    value: 'kpi_trend',
    label: 'KPI Trend',
    hint: 'Plot a KPI over time for this portfolio',
    example: {
      metric_code: 'RENEWABLE_MWH',
      period: { window: '12m' },
      style: { smooth: true }
    }
  },
  {
    value: 'emissions_bar',
    label: 'Emissions Bar',
    hint: 'Compare financed emissions by scope/category',
    example: {
      series: [
        { label: 'Scope 1', metric_code: 'SCOPE1_CO2E' },
        { label: 'Scope 2', metric_code: 'SCOPE2_CO2E' },
        { label: 'Scope 3', metric_code: 'SCOPE3_CO2E' }
      ],
      normalize: false
    }
  },
  {
    value: 'target_gauge',
    label: 'Target vs Actual Gauge',
    hint: 'Show progress toward a goal using the latest KPI (metric_code) or a manual value.',
    example: {
      metric_code: 'CLIENTS_SERVED',
      target: 15000,
      unit: 'clients',
      // Optional advanced options:
      // value: 9800,        // use direct value instead of fetching series
      // min: 0,             // default 0
      // max: 15000,         // default = target
      bands: [              // colored arc bands as fractions of max
        { upto: 0.4, color: '#fee2e2' },
        { upto: 0.75, color: '#fef3c7' },
        { upto: 1.0, color: '#dcfce7' }
      ]
    }
  }
  ,
  {
    value: 'people_grid',
    label: 'People Grid (people helped)',
    hint: 'Show total people helped as a grid of icons; last icon can be partially filled.',
    example: {
      total: 12430,
      perUnit: 10,
      iconSize: 16,
      target: 20000
      // color: 'var(--azure)' // optional override
    }
  }
  ,
  {
    value: 'people_grid_auto',
    label: 'People Grid (live)',
    hint: 'Automatically fetch a KPI and render people helped as a grid of icons. Paste/edit only the CONFIG here (not a full carousel item).',
    example: {
      metric_code: 'CLIENTS_SERVED',
      mode: 'sum',
      window: '12m',
      perUnit: 10,
      iconSize: 16,
      target: 20000
    }
  }
  ,
  {
    value: 'd3_json',
    label: 'D3 JSON',
    hint: 'Upload or paste a D3-friendly JSON spec (we store it as-is in widget.config).',
    example: {
      d3: {
        kind: 'bar',
        data: [ { label: 'A', value: 10 }, { label: 'B', value: 7 } ],
        encoding: { x: 'label', y: 'value' }
      }
    }
  }
  ,
  {
    value: 'holdings_pie',
    label: 'Holdings Pie (manual)',
    hint: 'Render a donut/pie from provided {label,value}[] data in config.',
    example: {
      data: [
        { label: 'Acme Solar SPV', value: 2500000 },
        { label: 'Green Transit Fund', value: 1200000 },
        { label: 'Impact Credit A', value: 750000 }
      ],
      size: 320,
      innerRadius: 48,
      showLegend: true,
      legendMaxHeight: 240
    }
  }
  ,
  {
    value: 'holdings_pie_auto',
    label: 'Holdings Pie (live)',
    hint: 'Fetch holdings for this portfolio and aggregate by name; override fields via config.',
    example: {
      size: 320,
      innerRadius: 48,
      showLegend: true,
      legendMaxHeight: 240,
      nameField: 'name',
      valueFieldPrimary: 'funds_allocated',
      valueFieldFallback: 'nav'
      // endpoint: '/api/portfolio/<id>/holdings' // optional override
    }
  },
  {
    value: 'radial_progress_rings',
    label: 'Radial Progress Rings',
    hint: 'Show multiple impact metrics as beautiful concentric progress rings - perfect for SDG goals or multi-dimensional impact tracking.',
    example: {
      size: 400,
      ringWidth: 32,
      spacing: 12,
      animated: true,
      rings: [
        {
          label: 'Clean Energy Generated',
          metric_code: 'RENEWABLE_MWH',
          target: 50000,
          unit: 'MWh',
          color: '#10b981'
        },
        {
          label: 'People Served',
          metric_code: 'CLIENTS_SERVED',
          target: 100000,
          unit: 'people',
          color: '#3b82f6'
        },
        {
          label: 'CO₂ Avoided',
          metric_code: 'CO2_AVOIDED',
          target: 25000,
          unit: 'tons',
          color: '#8b5cf6'
        }
      ]
    }
  },
  {
    value: 'small_multiples',
    label: 'Small Multiples (Metric Comparison)',
    hint: 'Compare the same metric across all holdings using sparkline charts in a grid layout.',
    example: {
      metric_code: 'RENEWABLE_MWH',
      window: '12m',
      columns: 3,
      chartHeight: 100,
      showBenchmark: false,
      minHoldings: 2
    }
  }
];

export default function EditWidgetsModal({ portfolioId, holdingId, open, onClose, onChanged }: EditWidgetsModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // lock body scroll while modal is open
  React.useEffect(() => {
    if (!mounted) return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, mounted]);

  // Determine API endpoint based on whether we're editing holding or portfolio widgets
  const apiEndpoint = holdingId
    ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
    : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

  const { data, error, isLoading, mutate } = useSWR<{ data: WidgetRow[] }>(
    open ? apiEndpoint : null,
    fetcher
  );

  const widgets = React.useMemo(() => (data?.data ?? []).slice().sort((a,b) => a.position - b.position), [data]);

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<WidgetRow | null>(null);
  const [draftType, setDraftType] = React.useState<string>('kpi_trend');
  const [draftTitle, setDraftTitle] = React.useState<string>('');
  const [draftConfig, setDraftConfig] = React.useState<string>('{}');
  const [isDragging, setIsDragging] = React.useState(false);
  const [draggedWidget, setDraggedWidget] = React.useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = React.useState<string | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [configMode, setConfigMode] = React.useState<'visual' | 'json'>('visual');
  const [availableMetrics, setAvailableMetrics] = React.useState<Array<{ metric_code: string; display_name: string }>>([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    setEditing(null);
    setDraftType('kpi_trend');
    setDraftTitle('');
    setDraftConfig('{}');
  }, [open, portfolioId]);

  function startCreate() {
    setEditing(null);
    setShowCreateModal(true);
  }

  function startEdit(w: WidgetRow) {
    setEditing(w);
    setShowCreateModal(true);
  }

  function chooseType(v: string) {
    setDraftType(v);
    const preset = WIDGET_TYPES.find(t => t.value === v)?.example ?? {};
    setDraftConfig(JSON.stringify(preset, null, 2));
  }

  function loadJsonTextToDraft(text: string) {
    try {
      const parsed = JSON.parse(text);
      setDraftType('d3_json');
      // try to pick a helpful title if present
      const t = (parsed.title || parsed.name || parsed.chartTitle);
      if (typeof t === 'string' && t.trim()) setDraftTitle(t.trim());
      setDraftConfig(JSON.stringify(parsed, null, 2));
      setErr(null);
    } catch (e:any) {
      setErr('Uploaded file is not valid JSON');
    }
  }

  function handleJsonFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.name.toLowerCase().endsWith('.json')) { setErr('Please choose a .json file'); return; }
    if (f.size > 1024 * 1024 * 2) { setErr('JSON file is too large (max 2 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => loadJsonTextToDraft(String(reader.result || ''));
    reader.onerror = () => setErr('Failed to read file');
    reader.readAsText(f);
  }

  // Helper to safely update config field
  function updateConfigField(field: string, value: any) {
    try {
      const j = JSON.parse(draftConfig || '{}');
      if (value === '' || value === undefined) {
        delete j[field];
      } else {
        j[field] = value;
      }
      setDraftConfig(JSON.stringify(j, null, 2));
    } catch {
      setDraftConfig(JSON.stringify({ [field]: value }, null, 2));
    }
  }

  // Helper to safely get config field
  function getConfigField(field: string, defaultValue: any = '') {
    try {
      const j = JSON.parse(draftConfig || '{}');
      return j[field] ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleJsonFile(e.dataTransfer.files);
      e.dataTransfer.clearData();
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) loadJsonTextToDraft(text);
  }

  async function saveDraft() {
    setBusy(true); setErr(null);
    let parsed: any = null;
    try { parsed = draftConfig ? JSON.parse(draftConfig) : {}; }
    catch (e:any) { setBusy(false); setErr('Config is not valid JSON'); return; }

    try {
      const body = { type: draftType, title: draftTitle || null, config: parsed } as any;
      if (editing) {
        const updateEndpoint = holdingId
          ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets/${encodeURIComponent(editing.id)}`
          : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(editing.id)}`;
        const res = await fetch(updateEndpoint, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Update failed');
      } else {
        const res = await fetch(apiEndpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Create failed');
      }
      await mutate();
      onChanged?.();
      setEditing(null);
      setDraftTitle('');
      setDraftConfig('{}');
    } catch (e:any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeWidget(id: string) {
    if (!confirm('Delete this widget? This cannot be undone.')) return;
    setBusy(true); setErr(null);
    try {
      const deleteUrl = holdingId
        ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets/${encodeURIComponent(id)}`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(id)}`;

      const res = await fetch(deleteUrl, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Delete failed');
      await mutate();
      onChanged?.();
    } catch (e:any) {
      setErr(e?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, delta: number) {
    const idx = widgets.findIndex(w => w.id === id);
    if (idx < 0) return;
    const target = widgets[idx + delta];
    if (!target) return;

    const a = widgets[idx];
    const b = target;

    // Optimistically update UI immediately
    const optimisticData = widgets.map(w => {
      if (w.id === a.id) return { ...w, position: b.position };
      if (w.id === b.id) return { ...w, position: a.position };
      return w;
    });

    mutate({ data: optimisticData }, false);
    setErr(null);

    try {
      const baseUrl = holdingId
        ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

      // Use a temporary position to avoid unique constraint violation
      const tempPosition = 999999;

      // Step 1: Move first widget to temp position
      const res1 = await fetch(`${baseUrl}/${encodeURIComponent(a.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: tempPosition })
      });

      if (!res1.ok) {
        const error1 = await res1.json().catch(() => ({}));
        throw new Error(error1?.error || 'Failed to reorder');
      }

      // Step 2: Move second widget to first's position
      const res2 = await fetch(`${baseUrl}/${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: a.position })
      });

      if (!res2.ok) {
        const error2 = await res2.json().catch(() => ({}));
        throw new Error(error2?.error || 'Failed to reorder');
      }

      // Step 3: Move first widget to second's position
      const res3 = await fetch(`${baseUrl}/${encodeURIComponent(a.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: b.position })
      });

      if (!res3.ok) {
        const error3 = await res3.json().catch(() => ({}));
        throw new Error(error3?.error || 'Failed to reorder');
      }

      // Revalidate to get fresh data from server
      await mutate();
      onChanged?.();
    } catch (e:any) {
      setErr(e?.message || 'Reorder failed');
      // Revert on error
      await mutate();
    }
  }

  function handleDragStart(e: React.DragEvent, widgetId: string) {
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, widgetId: string) {
    e.preventDefault();
    if (draggedWidget && draggedWidget !== widgetId) {
      setDragOverWidget(widgetId);
    }
  }

  function handleDragLeave() {
    setDragOverWidget(null);
  }

  async function handleWidgetDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverWidget(null);

    if (!draggedWidget || draggedWidget === targetId) {
      setDraggedWidget(null);
      return;
    }

    const fromIdx = widgets.findIndex(w => w.id === draggedWidget);
    const toIdx = widgets.findIndex(w => w.id === targetId);

    if (fromIdx < 0 || toIdx < 0) {
      setDraggedWidget(null);
      return;
    }

    const from = widgets[fromIdx];
    const to = widgets[toIdx];

    // Optimistically update UI immediately
    const optimisticData = widgets.map(w => {
      if (w.id === from.id) return { ...w, position: to.position };
      if (w.id === to.id) return { ...w, position: from.position };
      return w;
    });

    mutate({ data: optimisticData }, false);
    setErr(null);
    setDraggedWidget(null);

    try {
      const baseUrl = holdingId
        ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

      // Use a temporary position to avoid unique constraint violation
      const tempPosition = 999999;

      // Step 1: Move dragged widget to temp position
      const res1 = await fetch(`${baseUrl}/${encodeURIComponent(from.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: tempPosition })
      });

      if (!res1.ok) {
        const error1 = await res1.json().catch(() => ({}));
        throw new Error(error1?.error || 'Failed to reorder');
      }

      // Step 2: Move target widget to dragged widget's position
      const res2 = await fetch(`${baseUrl}/${encodeURIComponent(to.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: from.position })
      });

      if (!res2.ok) {
        const error2 = await res2.json().catch(() => ({}));
        throw new Error(error2?.error || 'Failed to reorder');
      }

      // Step 3: Move dragged widget to target's position
      const res3 = await fetch(`${baseUrl}/${encodeURIComponent(from.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: to.position })
      });

      if (!res3.ok) {
        const error3 = await res3.json().catch(() => ({}));
        throw new Error(error3?.error || 'Failed to reorder');
      }

      // Revalidate to get fresh data from server
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setErr(e?.message || 'Reorder failed');
      // Revert on error
      await mutate();
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-200'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-widgets-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-gradient-to-b from-white to-neutral-50 shadow-2xl ring-1 ring-black/10 animate-in slide-in-from-top-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm rounded-t-3xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-azure via-azure/90 to-azure/70 shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <div>
                <h3 id="edit-widgets-title" className="text-xl font-bold text-neutral-900 tracking-tight">
                  {holdingId ? 'Holding Widgets' : 'Dashboard Widgets'}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-600">
                  Customize your visualizations and insights
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="group rounded-xl p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-all duration-200"
            aria-label="Close"
            disabled={busy}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-azure/10 mb-3">
                  <svg className="w-6 h-6 text-azure animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-sm text-neutral-600">Loading widgets...</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-red-900">Error loading widgets</h4>
                  <p className="text-sm text-red-700 mt-1">{error?.message || 'Failed to load'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Widgets List Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    Your Widgets
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-azure/10 text-azure">
                      {widgets.length}
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Manage and reorder your dashboard visualizations</p>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium shadow-lg shadow-azure/25 hover:shadow-xl hover:shadow-azure/30 hover:scale-105 transition-all duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Widget
                </button>
              </div>

              {/* Widgets List */}
              {widgets.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-100 mb-4">
                    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-900 mb-1">No widgets yet</h4>
                  <p className="text-sm text-neutral-500 mb-4">Get started by adding your first visualization</p>
                  <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Widget
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {widgets.map((w, i) => (
                    <li
                      key={w.id}
                      draggable={!busy}
                      onDragStart={(e) => handleDragStart(e, w.id)}
                      onDragOver={(e) => handleDragOver(e, w.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleWidgetDrop(e, w.id)}
                      className={clsx(
                        'group relative rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200',
                        draggedWidget === w.id && 'opacity-40 scale-95',
                        dragOverWidget === w.id && 'border-azure ring-2 ring-azure/20 scale-102',
                        !draggedWidget && 'hover:shadow-md hover:border-azure/30 cursor-move',
                        draggedWidget && draggedWidget !== w.id && 'cursor-grabbing',
                        !draggedWidget ? 'border-neutral-200' : 'border-neutral-300'
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Drag Handle */}
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg hover:bg-neutral-100 cursor-grab active:cursor-grabbing">
                            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          {/* Widget Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-sm font-semibold text-neutral-900 truncate">
                                {w.title || '(Untitled Widget)'}
                              </h5>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-600">
                                {w.type}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500">Position {w.position + 1}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => move(w.id, -1)}
                            disabled={i === 0 || busy}
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            title="Move up"
                          >
                            <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => move(w.id, +1)}
                            disabled={i === widgets.length - 1 || busy}
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            title="Move down"
                          >
                            <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(w)}
                            className="px-3 py-2 rounded-lg border border-neutral-200 hover:bg-azure/5 hover:border-azure/30 hover:text-azure text-sm font-medium text-neutral-700 transition-all duration-150"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeWidget(w.id)}
                            className="p-2 rounded-lg border border-red-200 hover:bg-red-50 hover:border-red-300 text-red-600 transition-all duration-150"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Create/Edit Widget Modal */}
        <CreateWidgetModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditing(null);
          }}
          onCreated={async () => {
            await mutate();
            onChanged?.();
            setShowCreateModal(false);
            setEditing(null);
          }}
          portfolioId={portfolioId}
          holdingId={holdingId}
          editing={editing}
        />
      </div>
    </div>,
    document.body
  );
}
