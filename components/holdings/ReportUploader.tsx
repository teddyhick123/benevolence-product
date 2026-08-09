'use client';

import { apiRequest, readJson, uploadJson } from "@/lib/api/client";
import { useState } from 'react';

type StagedFact = {
  id: string;
  metric_code: string;
  value: number;
  unit?: string;
  period_end?: string;
  source?: string;
  verification_level?: string;
};

type KpiDef = {
  metric_code: string;
  display_name: string | null;
  target_value: number | null;
};

export default function ReportUploader({
  holdingId,
  portfolioId,
  holdingName,
}: {
  holdingId: string;
  portfolioId: string;
  holdingName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [factsCount, setFactsCount] = useState(0);
  const [chunksProcessed, setChunksProcessed] = useState(0);
  const [stagedFacts, setStagedFacts] = useState<StagedFact[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [aiMode, setAiMode] = useState(true);
  const [factError, setFactError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiDef[]>([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [selectedMetricCodes, setSelectedMetricCodes] = useState<string[]>([]);

  // 200MB limit (handled in chunks on server)
  const MAX_FILE_SIZE = 200 * 1024 * 1024;

  /** Loaded only when AI mode is switched off, since that is the only mode that restricts extraction. */
  async function ensureKpis() {
    if (!portfolioId || kpiLoading || kpis.length) return;
    setKpiLoading(true);
    try {
      const res = await apiRequest(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await readJson(res);
        if (Array.isArray(data.data)) {
          setKpis(data.data);
          setSelectedMetricCodes((prev) =>
            prev.length ? prev : data.data.map((kpi: KpiDef) => kpi.metric_code)
          );
        }
      }
    } catch {} finally {
      setKpiLoading(false);
    }
  }

  async function loadStagedFacts(id: string) {
    try {
      const res = await apiRequest(`/api/admin/upload/${id}/staged-facts`);
      if (res.ok) {
        const data = await readJson(res);
        setStagedFacts(data.facts || []);
      }
    } catch {}
  }

  async function approveFact(factId: string) {
    try {
      const res = await apiRequest(`/api/admin/staged-facts/${factId}/approve`, { method: 'POST' });
      if (!res.ok) {
        const d = await readJson(res).catch(() => ({}));
        throw new Error(d.error || `Approve failed (${res.status})`);
      }
      setStagedFacts((prev) => prev.filter((f) => f.id !== factId));
      setFactError(null);
    } catch (err: any) {
      setFactError(err.message || 'Failed to approve fact');
    }
  }

  async function rejectFact(factId: string) {
    try {
      const res = await apiRequest(`/api/admin/staged-facts/${factId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await readJson(res).catch(() => ({}));
        throw new Error(d.error || `Reject failed (${res.status})`);
      }
      setStagedFacts((prev) => prev.filter((f) => f.id !== factId));
      setFactError(null);
    } catch (err: any) {
      setFactError(err.message || 'Failed to reject fact');
    }
  }

  async function approveAll() {
    setFactError(null);
    const errors: string[] = [];
    for (const fact of stagedFacts) {
      try {
        await approveFact(fact.id);
      } catch (err: any) {
        errors.push(`${fact.metric_code}: ${err.message}`);
      }
    }
    if (errors.length) setFactError(`Some facts failed: ${errors.join('; ')}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setStatus('error');
      setMsg(`File too large. Maximum size is 200MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    // With AI mode off and no KPIs chosen the server has nothing to restrict
    // extraction to, so it would silently fall back to extracting anything.
    if (!aiMode && selectedMetricCodes.length === 0) {
      setStatus('error');
      setMsg('Select at least one KPI, or turn AI mode on to extract any KPI found.');
      return;
    }

    setStatus('uploading');
    setMsg('Processing document... This may take a moment for large files.');
    setFactsCount(0);
    setChunksProcessed(0);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('portfolio_id', portfolioId);
      fd.append('holding_id', holdingId);
      fd.append('ai_mode', aiMode ? 'true' : 'false');
      if (!aiMode) {
        fd.append('selected_metrics', selectedMetricCodes.join(','));
      }

      const data = await uploadJson<any>('/api/admin/upload', fd, { method: 'POST' });

      // Processing is now synchronous - we get results directly
      setUploadId(data.uploadId);
      setFactsCount(data.factsExtracted || 0);
      setChunksProcessed(data.chunksProcessed || 0);
      setStatus('done');
      setMsg(
        data.factsExtracted > 0
          ? `Extracted ${data.factsExtracted} facts from ${data.chunksProcessed} document sections.`
          : data.message || 'No facts found in document.'
      );

      // Load staged facts for review
      if (data.factsExtracted > 0 && data.uploadId) {
        loadStagedFacts(data.uploadId);
      }
    } catch (err: any) {
      setStatus('error');
      setMsg(err?.message || 'Upload failed');
    }
  }

  function reset() {
    setFile(null);
    setStatus('idle');
    setMsg('');
    setUploadId(null);
    setFactsCount(0);
    setChunksProcessed(0);
    setStagedFacts([]);
    setShowReview(false);
  }

  const disabled = !file || status === 'uploading';

  return (
    <div className="space-y-4">
      {/* AI mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-800">AI Mode</div>
          <div className="text-xs text-neutral-600">
            If enabled, extracts <em>any</em> KPIs found in the document. If disabled, it
            limits extraction to the selected KPIs below.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-neutral-700">Off</span>
          <input
            type="checkbox"
            checked={aiMode}
            onChange={async (e) => {
              const enabled = e.target.checked;
              setAiMode(enabled);
              if (!enabled) await ensureKpis();
            }}
            className="h-5 w-9 appearance-none bg-neutral-200 rounded-full relative transition outline-none before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow before:transition checked:bg-azure checked:before:translate-x-4"
          />
          <span className="text-sm text-neutral-700">On</span>
        </label>
      </div>

      {!aiMode && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-neutral-700">Selected KPIs</div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="underline"
                onClick={() => setSelectedMetricCodes(kpis.map((kpi) => kpi.metric_code))}
              >
                Select all
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => setSelectedMetricCodes([])}
              >
                Clear
              </button>
            </div>
          </div>
          {kpiLoading ? (
            <div className="text-sm text-neutral-600">Loading KPIs…</div>
          ) : kpis.length === 0 ? (
            <div className="text-sm text-neutral-600">
              No KPIs configured for this portfolio yet. Turn AI mode on to extract any KPI
              found.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kpis.map((kpi) => {
                const checked = selectedMetricCodes.includes(kpi.metric_code);
                return (
                  <label
                    key={kpi.metric_code}
                    className={`inline-flex items-center gap-1.5 px-2 py-[2px] rounded-full text-xs border cursor-pointer ${checked ? 'bg-azure/10 text-azure border-azure/20' : 'bg-white text-neutral-700 border-black/10'}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedMetricCodes((prev) =>
                          e.target.checked
                            ? [...prev, kpi.metric_code]
                            : prev.filter((code) => code !== kpi.metric_code)
                        )
                      }
                    />
                    {kpi.display_name || kpi.metric_code}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div
          className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-azure/50 bg-white text-center"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            id={`reportFileInput-${holdingId}`}
          />
          <label htmlFor={`reportFileInput-${holdingId}`} className="cursor-pointer text-sm text-azure">
            {file ? `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)` : 'Click to choose a file or drag and drop here'}
          </label>
          <p className="text-xs text-neutral-500 mt-1">CSV, XLSX, XLS, PDF, or DOCX (up to 200MB)</p>
        </div>

        <div className="text-sm text-neutral-600">
          Uploading for: <span className="font-medium">{holdingName}</span>
        </div>

        <button
          disabled={disabled}
          className="px-5 py-2.5 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition"
        >
          {status === 'uploading' ? 'Processing...' : 'Upload Report'}
        </button>
      </form>

      {/* Processing indicator */}
      {status === 'uploading' && (
        <div className="p-4 rounded-2xl bg-azure/5 border border-azure/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-800">{msg}</div>
              <div className="text-xs text-neutral-500 mt-1">
                Large documents are split into sections and processed individually.
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-600 p-3 rounded-lg bg-red-50 border border-red-200">{msg}</div>
      )}

      {status === 'done' && (
        <div className="space-y-4">
          <div className="p-3 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-3 flex-wrap">
            <span>{msg}</span>
            {stagedFacts.length > 0 && (
              <button onClick={() => setShowReview(!showReview)} className="text-sm underline font-medium">
                {showReview ? 'Hide' : 'Review & Approve'}
              </button>
            )}
            <button onClick={reset} className="text-sm underline font-medium text-azure">
              Upload Another
            </button>
          </div>

          {factError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {factError}
            </div>
          )}

          {showReview && stagedFacts.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold">Review Extracted Facts</h4>
                <button
                  onClick={approveAll}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Approve All ({stagedFacts.length})
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stagedFacts.map((fact) => (
                  <div key={fact.id} className="p-3 rounded-lg border border-neutral-200 bg-white hover:border-azure/40 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-medium text-azure">{fact.metric_code}</span>
                          <span className="text-lg font-semibold text-neutral-900">{fact.value}</span>
                          {fact.unit && <span className="text-sm text-neutral-500">{fact.unit}</span>}
                        </div>
                        <div className="text-xs text-neutral-600 space-x-3">
                          {fact.period_end && <span>Period: {fact.period_end}</span>}
                          {fact.source && <span>Source: {fact.source}</span>}
                          {fact.verification_level && <span>Verification: {fact.verification_level}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveFact(fact.id)}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectFact(fact.id)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
