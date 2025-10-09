'use client';

import * as React from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { createPortal } from 'react-dom';

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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    setEditing(null);
    setDraftType('kpi_trend');
    setDraftTitle('');
    setDraftConfig('{}');
  }, [open]);

  function startCreate() {
    setEditing(null);
    setDraftType('kpi_trend');
    setDraftTitle('');
    setDraftConfig(JSON.stringify(WIDGET_TYPES[0].example, null, 2));
  }

  function startEdit(w: WidgetRow) {
    setEditing(w);
    setDraftType(w.type);
    setDraftTitle(w.title || '');
    setDraftConfig(JSON.stringify(w.config ?? {}, null, 2));
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
      const res = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
    setBusy(true); setErr(null);
    try {
      const a = widgets[idx];
      const b = target;
      // swap positions optimistically
      await Promise.all([
        fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(a.id)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ position: b.position }) }),
        fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(b.id)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ position: a.position }) }),
      ]);
      await mutate();
      onChanged?.();
    } catch (e:any) {
      setErr(e?.message || 'Reorder failed');
    } finally {
      setBusy(false);
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
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-azure to-blue-600 shadow-lg">
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-azure to-blue-600 text-white text-sm font-medium shadow-lg shadow-azure/25 hover:shadow-xl hover:shadow-azure/30 hover:scale-105 transition-all duration-200"
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
                      className="group relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-azure/30 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-4">
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

              {/* Editor Section */}
              <div className="border-t border-neutral-200 pt-6 mt-6">
                <div className="mb-4">
                  <h4 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                    {editing ? (
                      <>
                        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Widget
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create New Widget
                      </>
                    )}
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    {editing ? 'Update the widget configuration below' : 'Configure your new widget using the options below'}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700 mb-2 block">Widget Type</span>
                    <select
                      value={draftType}
                      onChange={(e) => chooseType(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure transition-all"
                    >
                      {WIDGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                      {draftType === 'd3_json'
                        ? '📊 Provide a D3-friendly JSON spec. Use Upload JSON, drag-and-drop, or paste below.'
                        : `ℹ️ ${WIDGET_TYPES.find(t => t.value === draftType)?.hint}`
                      }
                    </p>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700 mb-2 block">Widget Title</span>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="e.g., Renewable Energy Trend"
                      className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure transition-all"
                    />
                    <p className="text-xs text-neutral-500 mt-1.5">Optional - Give your widget a descriptive name</p>
                  </label>

                  <label className="sm:col-span-2 text-sm">
                    <div className="mb-1 text-neutral-700 flex items-center justify-between">
                      <span>Config (JSON)</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5 text-xs"
                          disabled={busy}
                        >Upload JSON</button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/json,.json"
                          className="hidden"
                          onChange={(e) => handleJsonFile(e.target.files)}
                        />
                      </div>
                    </div>

                    <div
                      onDragEnter={(e)=>{e.preventDefault(); setIsDragging(true);}}
                      onDragOver={(e)=>{e.preventDefault();}}
                      onDragLeave={(e)=>{e.preventDefault(); setIsDragging(false);}}
                      onDrop={handleDrop}
                      className={clsx(
                        'rounded-2xl border px-3 py-2',
                        isDragging ? 'border-azure ring-2 ring-azure/30 bg-azure/5' : 'border-black/10'
                      )}
                    >
                      <textarea
                        value={draftConfig}
                        onChange={(e)=>setDraftConfig(e.target.value)}
                        rows={8}
                        className="w-full resize-y outline-none bg-transparent font-mono text-xs"
                        placeholder="Paste D3 JSON here or use Upload JSON"
                      />
                      <div className="text-xs text-neutral-500 mt-1">
                        Tip: Drop a <code>.json</code> file here, paste JSON, or click <em>Upload JSON</em>. Selecting a file will set the type to <code>d3_json</code> automatically.
                      </div>
                      {(draftType === 'people_grid' || draftType === 'people_grid_auto') && (
                        <div className="text-[11px] text-neutral-500 mt-1">Note: Paste only the <em>config</em> JSON (e.g., {`{ "total": 12430 }`} or {`{ "metric_code": "CLIENTS_SERVED" }`}). Do not include fields like <code>id</code>, <code>label</code>, or <code>type</code>.</div>
                      )}
                      {draftType === 'target_gauge' && (
                        <div className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                          <div className="font-medium text-neutral-700 mb-0.5">Target Gauge config keys:</div>
                          <code className="whitespace-pre-wrap block bg-neutral-50 border border-black/10 rounded-md px-2 py-1">{
                            `{\n  metric_code?: string,  // fetch latest KPI value\n  value?: number,        // direct value (if no metric_code)\n  target: number,        // REQUIRED\n  min?: number,          // default 0\n  max?: number,          // default = target\n  unit?: string,         // label (e.g., clients, tCO2)\n  bands?: [{ upto: number; color: string }] // arc bands (0..1 of max)\n}`
                          }</code>
                        </div>
                      )}
                    </div>
                      {draftType === 'people_grid_auto' && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">metric_code</span>
                            <input
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.metric_code ?? ''; } catch { return ''; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.metric_code = e.target.value; setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                              placeholder="CLIENTS_SERVED"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">mode</span>
                            <select
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.mode ?? 'sum'; } catch { return 'sum'; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.mode = e.target.value; setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                            >
                              <option value="sum">sum</option>
                              <option value="latest">latest</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">window</span>
                            <input
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.window ?? '12m'; } catch { return '12m'; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.window = e.target.value; setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                              placeholder="12m"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">perUnit</span>
                            <input
                              type="number"
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.perUnit ?? 10; } catch { return 10; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.perUnit = Number(e.target.value||0); setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                              min={1}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">iconSize</span>
                            <input
                              type="number"
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.iconSize ?? 16; } catch { return 16; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.iconSize = Number(e.target.value||0); setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                              min={8}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-neutral-700">target</span>
                            <input
                              type="number"
                              className="rounded-2xl border border-black/10 px-2 py-1"
                              value={(() => { try { const j = JSON.parse(draftConfig||'{}'); return j.target ?? ''; } catch { return ''; } })()}
                              onChange={(e)=>{
                                try { const j = JSON.parse(draftConfig||'{}'); j.target = e.target.value === '' ? undefined : Number(e.target.value); setDraftConfig(JSON.stringify(j, null, 2)); } catch { /* ignore */ }
                              }}
                              placeholder="20000"
                            />
                          </label>
                          <div className="sm:col-span-3 text-[11px] text-neutral-500 mt-1">
                            This form edits the <strong>config</strong> for the widget. Do not paste a full carousel item here.
                          </div>
                        </div>
                      )}
                  </label>
                </div>

                {err && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h5 className="text-sm font-semibold text-red-900">Error</h5>
                        <p className="text-sm text-red-700 mt-0.5">{err}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setDraftTitle('');
                      setDraftConfig('{}');
                      setErr(null);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-all"
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveDraft}
                    className={clsx(
                      'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold',
                      'bg-gradient-to-r from-azure to-blue-600 text-white',
                      'shadow-lg shadow-azure/25 hover:shadow-xl hover:shadow-azure/30',
                      'hover:scale-105 transition-all duration-200',
                      'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100'
                    )}
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {editing ? 'Save Changes' : 'Create Widget'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
