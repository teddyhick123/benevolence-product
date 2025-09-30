'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type MeResponse = { user: any | null; portfolio_id: string | null };

type KpiDef = { metric_code: string; display_name: string | null; target_value: number | null; target_date: string | null; order_index: number | null };

type HoldingLite = { id: string; name: string | null };

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [portfolioName, setPortfolioName] = useState<string | null>(null);
  const [holdingName, setHoldingName] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [msg, setMsg] = useState<string>('');

  const [showKpiList, setShowKpiList] = useState(false);
  const [kpis, setKpis] = useState<KpiDef[]>([]);
  const [kpiLoading, setKpiLoading] = useState(false);

  const [holdings, setHoldings] = useState<HoldingLite[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);

  const [aiMode, setAiMode] = useState<boolean>(true);
  const [selectedMetricCodes, setSelectedMetricCodes] = useState<string[]>([]);

  const searchParams = useSearchParams();
  const qsPortfolioId = searchParams?.get('portfolio_id') || searchParams?.get('id') || searchParams?.get('portfolioId') || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) If URL specifies portfolio_id, prefer it.
      if (qsPortfolioId) {
        if (!cancelled) setPortfolioId(qsPortfolioId);
        return;
      }
      // 2) Else try /api/me
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        let me: MeResponse | null = null;
        if (res.ok) me = await res.json();
        const envPid = process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';
        const derived = me?.portfolio_id || (envPid || null);
        if (!cancelled) setPortfolioId(derived);
      } catch {
        const envPid = process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';
        if (!cancelled) setPortfolioId(envPid || null);
      }
    })();
    return () => { cancelled = true; };
  }, [qsPortfolioId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!portfolioId) { setPortfolioName(null); return; }
      try {
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/meta`, { cache: 'no-store' });
        if (!r.ok) throw new Error('Failed');
        const j = await r.json();
        if (!cancelled) setPortfolioName(j?.name ?? portfolioId);
      } catch {
        if (!cancelled) setPortfolioName(portfolioId);
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!portfolioId) { setHoldings([]); setSelectedHoldingId(null); return; }
      setHoldingsLoading(true);
      try {
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/holdings`, { cache: 'no-store' });
        if (!r.ok) throw new Error('Failed to load holdings');
        const j = await r.json();
        const list: HoldingLite[] = Array.isArray(j?.data)
          ? j.data.map((h: any) => ({ id: String(h.id), name: h.name ?? null }))
          : [];
        if (!cancelled) {
          setHoldings(list);
          setSelectedHoldingId((prev) => {
            const chosenId = (prev && list.some((x) => x.id === prev)) ? prev : (list[0]?.id ?? null);
            const chosen = list.find((x) => x.id === chosenId);
            setHoldingName(chosen?.name ?? chosen?.id ?? null);
            return chosenId;
          });
        }
      } catch {
        if (!cancelled) { setHoldings([]); setSelectedHoldingId(null); }
      } finally {
        if (!cancelled) setHoldingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  async function ensureKpis() {
    if (!portfolioId || kpiLoading || kpis.length) return;
    setKpiLoading(true);
    try {
      const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && Array.isArray(j?.data)) {
        setKpis(j.data);
        setSelectedMetricCodes((prev) => prev.length ? prev : j.data.map((x: KpiDef) => x.metric_code));
      }
    } finally {
      setKpiLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!portfolioId) { setMsg('No portfolio selected.'); return; }
    if (!selectedHoldingId) { setMsg('Please choose a holding to upload for.'); return; }

    setStatus('uploading');
    setMsg('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('portfolio_id', portfolioId);
      fd.append('autoApprove', 'true');
      fd.append('holding_id', selectedHoldingId);
      fd.append('ai_mode', aiMode ? 'true' : 'false');
      if (!aiMode) {
        const metricsCsv = selectedMetricCodes.join(',');
        fd.append('selected_metrics', metricsCsv);
      }

      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setStatus('done');
      setMsg(`Upload complete! Job id: ${data.uploadId}`);
    } catch (err: any) {
      setStatus('error');
      setMsg(err?.message || 'Upload failed');
    }
  }

  const disabled = !file || status === 'uploading' || !portfolioId || !selectedHoldingId;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Upload End‑of‑Year Report</h1>

      {/* Allowed KPIs toggle */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-600">Allowed KPIs for this portfolio</div>
          <button
            onClick={async () => { setShowKpiList(!showKpiList); if (!showKpiList) await ensureKpis(); }}
            className="text-sm px-3 py-1.5 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
            disabled={!portfolioId}
          >
            {showKpiList ? 'Hide' : 'Show'}
          </button>
        </div>
        {showKpiList && (
          <div className="mt-3">
            {!portfolioId ? (
              <div className="text-sm text-neutral-600">No portfolio selected.</div>
            ) : kpiLoading ? (
              <div className="h-4 w-1/2 bg-neutral-200 rounded animate-pulse" />
            ) : kpis.length === 0 ? (
              <div className="text-sm text-neutral-600">No KPIs configured yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kpis.map((k) => (
                  <span key={k.metric_code} className="inline-flex items-center px-2 py-[2px] rounded-full text-xs border bg-azure/10 text-azure border-azure/20">
                    {(k.display_name || k.metric_code)}{k.target_value != null ? ` · target ${k.target_value}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!portfolioId && (
        <div className="p-3 rounded-2xl bg-yellow-50 text-yellow-800 text-sm border border-yellow-200">
          We couldn’t determine a <b>portfolio</b> to upload into.
          {process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT
            ? ' Using your default ID will fix this.'
            : ' Ask an admin to assign your portfolio in Profiles or set NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT.'}
        </div>
      )}

      {/* Holding picker */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-600">Select Holding</div>
          {holdingsLoading ? <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse" /> : null}
        </div>
        <div className="mt-2">
          <select
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
            disabled={!portfolioId || holdingsLoading || holdings.length === 0}
            value={selectedHoldingId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelectedHoldingId(id);
              const chosen = holdings.find((h) => h.id === id);
              setHoldingName(chosen?.name ?? id);
            }}
          >
            {holdings.length === 0 ? (
              <option value="">{portfolioId ? 'No holdings found' : 'Select a portfolio first'}</option>
            ) : null}
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>{h.name || h.id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* AI mode toggle */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-800">AI Mode</div>
            <div className="text-xs text-neutral-600">If enabled, the workflow extracts <em>any</em> KPIs it finds. If disabled, it limits to the selected KPIs below.</div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-neutral-700">Off</span>
            <input
              type="checkbox"
              checked={aiMode}
              onChange={(e) => setAiMode(e.target.checked)}
              className="h-5 w-9 appearance-none bg-neutral-200 rounded-full relative transition outline-none before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow before:transition checked:bg-azure checked:before:translate-x-4"
            />
            <span className="text-sm text-neutral-700">On</span>
          </label>
        </div>

        {!aiMode && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-neutral-700">Selected KPIs</div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="underline" onClick={() => setSelectedMetricCodes(kpis.map(k => k.metric_code))}>Select all</button>
                <button type="button" className="underline" onClick={() => setSelectedMetricCodes([])}>Clear</button>
              </div>
            </div>
            {kpis.length === 0 ? (
              <div className="text-sm text-neutral-600">No KPIs configured yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kpis.map((k) => {
                  const checked = selectedMetricCodes.includes(k.metric_code);
                  return (
                    <label key={k.metric_code} className={`inline-flex items-center gap-1.5 px-2 py-[2px] rounded-full text-xs border cursor-pointer ${checked ? 'bg-azure/10 text-azure border-azure/20' : 'bg-white text-neutral-700 border-black/10'}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSelectedMetricCodes((prev) => on ? [...prev, k.metric_code] : prev.filter(x => x !== k.metric_code));
                        }}
                      />
                      {(k.display_name || k.metric_code)}
                      {k.target_value != null ? ` · target ${k.target_value}` : ''}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div
          className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-azure/50 bg-white text-center"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              setFile(e.dataTransfer.files[0]);
            }
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            id="fileInput"
          />
          <label htmlFor="fileInput" className="cursor-pointer text-sm text-azure">
            {file ? `Selected file: ${file.name}` : 'Click to choose a file or drag and drop here'}
          </label>
        </div>
        <div className="text-sm text-neutral-600">
          Uploading into portfolio: <span className="font-medium">{portfolioName ?? portfolioId ?? '—'}</span>
          {selectedHoldingId ? (<>{' '}• Holding: <span className="font-medium">{holdingName ?? selectedHoldingId}</span></>) : null}
        </div>
        <button
          disabled={disabled}
          className="px-5 py-2.5 rounded-md bg-azure text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition"
        >
          {status === 'uploading' ? 'Uploading…' : 'Start Upload'}
        </button>
      </form>

      {status !== 'idle' && (
        <div className={`text-sm mt-2 ${status === 'error' ? 'text-red-600' : 'text-green-700'}`}>
          {msg}
        </div>
      )}

      {status === 'done' && (
        <div className="p-3 rounded-2xl bg-green-50 border border-green-200">
          ✅ Ingestion started. <a className="underline" href="/dashboard">Go to dashboard</a>
        </div>
      )}
    </div>
  );
}