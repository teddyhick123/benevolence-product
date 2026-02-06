'use client';
import { useEffect, useState } from 'react';

type StagedFact = {
  id: string;
  metric_code: string;
  value: number;
  unit?: string;
  period_end?: string;
  source?: string;
  verification_level?: string;
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
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [factsCount, setFactsCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stagedFacts, setStagedFacts] = useState<StagedFact[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [aiMode, setAiMode] = useState(true);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  async function loadStagedFacts(id: string) {
    try {
      const res = await fetch(`/api/admin/upload/${id}/staged-facts`);
      if (res.ok) {
        const data = await res.json();
        setStagedFacts(data.facts || []);
      }
    } catch {}
  }

  async function approveFact(factId: string) {
    try {
      const res = await fetch(`/api/admin/staged-facts/${factId}/approve`, { method: 'POST' });
      if (res.ok) setStagedFacts((prev) => prev.filter((f) => f.id !== factId));
    } catch {}
  }

  async function rejectFact(factId: string) {
    try {
      const res = await fetch(`/api/admin/staged-facts/${factId}`, { method: 'DELETE' });
      if (res.ok) setStagedFacts((prev) => prev.filter((f) => f.id !== factId));
    } catch {}
  }

  async function approveAll() {
    for (const fact of stagedFacts) {
      await approveFact(fact.id);
    }
  }

  useEffect(() => {
    if (!uploadId || status === 'done' || status === 'error') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/upload/${uploadId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'done') {
            setStatus('done');
            setProgress(100);
            setFactsCount(data.factsExtracted || 0);
            setMsg(`Processing complete! Extracted ${data.factsExtracted || 0} facts.`);
            if (aiMode && data.factsExtracted > 0) loadStagedFacts(uploadId);
          } else if (data.status === 'error') {
            setStatus('error');
            setProgress(0);
            setMsg('Processing failed. Please try again.');
          } else if (data.status === 'processing') {
            setStatus('processing');
            setProgress((prev) => Math.min(90, prev + 5));
            setMsg('Extracting data from document...');
            setFactsCount(data.factsExtracted || 0);
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [uploadId, status, aiMode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setStatus('error');
      setMsg(`File too large. Maximum size is 50MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    setStatus('uploading');
    setMsg('Uploading file...');
    setFactsCount(0);
    setProgress(10);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('portfolio_id', portfolioId);
      fd.append('holding_id', holdingId);
      fd.append('autoApprove', 'true');
      fd.append('ai_mode', aiMode ? 'true' : 'false');

      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Upload failed');

      setUploadId(data.uploadId);
      setStatus('processing');
      setProgress(20);
      setMsg('Processing document...');
    } catch (err: any) {
      setStatus('error');
      setProgress(0);
      setMsg(err?.message || 'Upload failed');
    }
  }

  function reset() {
    setFile(null);
    setStatus('idle');
    setMsg('');
    setUploadId(null);
    setFactsCount(0);
    setProgress(0);
    setStagedFacts([]);
    setShowReview(false);
  }

  const disabled = !file || status === 'uploading' || status === 'processing';

  return (
    <div className="space-y-4">
      {/* AI mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-800">AI Mode</div>
          <div className="text-xs text-neutral-600">
            Extract <em>any</em> KPIs found in the document
          </div>
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
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            id={`reportFileInput-${holdingId}`}
          />
          <label htmlFor={`reportFileInput-${holdingId}`} className="cursor-pointer text-sm text-azure">
            {file ? `Selected: ${file.name}` : 'Click to choose a file or drag and drop here'}
          </label>
          <p className="text-xs text-neutral-500 mt-1">CSV, XLSX, XLS, or PDF</p>
        </div>

        <div className="text-sm text-neutral-600">
          Uploading for: <span className="font-medium">{holdingName}</span>
        </div>

        <button
          disabled={disabled}
          className="px-5 py-2.5 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition"
        >
          {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : 'Upload Report'}
        </button>
      </form>

      {/* Progress indicator */}
      {(status === 'uploading' || status === 'processing') && (
        <div className="p-4 rounded-2xl bg-azure/5 border border-azure/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-800">{msg}</div>
              {factsCount > 0 && (
                <div className="text-xs text-neutral-600 mt-1">{factsCount} facts extracted so far...</div>
              )}
            </div>
            <div className="text-sm font-medium text-azure">{progress}%</div>
          </div>
          <div className="relative h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-azure rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {status !== 'idle' && status !== 'processing' && status !== 'uploading' && (
        <div className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-green-700'}`}>{msg}</div>
      )}

      {status === 'done' && (
        <div className="space-y-4">
          <div className="p-3 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-3 flex-wrap">
            <span>Processing complete! {factsCount > 0 && `Extracted ${factsCount} facts.`}</span>
            {stagedFacts.length > 0 && (
              <button onClick={() => setShowReview(!showReview)} className="text-sm underline font-medium">
                {showReview ? 'Hide' : 'Review & Approve'}
              </button>
            )}
            <button onClick={reset} className="text-sm underline font-medium text-azure">
              Upload Another
            </button>
          </div>

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
