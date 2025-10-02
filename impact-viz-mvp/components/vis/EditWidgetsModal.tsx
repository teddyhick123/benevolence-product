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
      className={clsx('fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6', 'bg-black/30 backdrop-blur-[1px]')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-widgets-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-black/5">
          <div className="min-w-0">
            <h3 id="edit-widgets-title" className="text-base font-semibold text-neutral-900">Edit dashboard widgets</h3>
            <p className="mt-0.5 text-sm text-neutral-600 truncate">Add charts, tweak config, and reorder</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="rounded-full p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-black/5" aria-label="Close">✕</button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="text-sm text-neutral-500">Loading widgets…</div>
          ) : error ? (
            <div className="text-sm rounded-md bg-red-50 text-red-700 px-3 py-2 border border-red-200">{error?.message || 'Failed to load'}</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-700">Widgets ({widgets.length})</div>
                <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5 text-sm">Add widget</button>
              </div>

              <ul className="space-y-2">
                {widgets.map((w, i) => (
                  <li key={w.id} className="border border-black/10 rounded-2xl p-3 bg-white flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900 truncate">{w.title || '(Untitled)'} <span className="text-xs font-normal text-neutral-500">— {w.type}</span></div>
                      <div className="text-xs text-neutral-500 truncate">pos {w.position}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => move(w.id, -1)} disabled={i===0 || busy} className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-black/5 text-sm">↑</button>
                      <button type="button" onClick={() => move(w.id, +1)} disabled={i===widgets.length-1 || busy} className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-black/5 text-sm">↓</button>
                      <button type="button" onClick={() => startEdit(w)} className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-black/5 text-sm">Edit</button>
                      <button type="button" onClick={() => removeWidget(w.id)} className="px-2 py-1 rounded-2xl border border-red-200 text-red-700 hover:bg-red-50 text-sm">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Editor */}
              <div className="border-t border-black/5 pt-4">
                <div className="text-sm text-neutral-700 font-medium mb-2">{editing ? 'Edit widget' : 'New widget'}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-neutral-700">Type</div>
                    <select value={draftType} onChange={(e)=>chooseType(e.target.value)} className="w-full rounded-2xl border border-black/10 px-3 py-2">
                      {WIDGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div className="text-xs text-neutral-500 mt-1">
                      {draftType === 'd3_json' ? 'Provide a D3-friendly JSON spec. Use the Upload JSON button, drag-and-drop, or paste into the field below.' : (WIDGET_TYPES.find(t=>t.value===draftType)?.hint)}
                    </div>
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-neutral-700">Title (optional)</div>
                    <input value={draftTitle} onChange={(e)=>setDraftTitle(e.target.value)} placeholder="My KPI Trend" className="w-full rounded-2xl border border-black/10 px-3 py-2" />
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

                {err ? <div className="text-sm rounded-md bg-red-50 text-red-700 px-3 py-2 border border-red-200 mt-2">{err}</div> : null}

                <div className="flex items-center justify-end gap-2 mt-3">
                  <button type="button" onClick={() => { setEditing(null); setDraftTitle(''); setDraftConfig('{}'); }} className="text-sm rounded-2xl px-3 py-1.5 border border-black/10 hover:bg-black/5" disabled={busy}>Clear</button>
                  <button type="button" onClick={saveDraft} className={clsx('text-sm inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5', 'bg-azure text-white shadow-soft hover:opacity-90 disabled:opacity-60')} disabled={busy}>
                    {busy ? 'Saving…' : (editing ? 'Save changes' : 'Add widget')}
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
