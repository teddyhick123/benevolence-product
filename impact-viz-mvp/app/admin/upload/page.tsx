'use client';
import { useEffect, useState } from 'react';

type MeResponse = { user: any | null; portfolio_id: string | null };

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!portfolioId) { setMsg('No portfolio selected.'); return; }

    setStatus('uploading');
    setMsg('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('portfolio_id', portfolioId);
      fd.append('autoApprove', 'true');

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

  const disabled = !file || status === 'uploading' || !portfolioId;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Upload End‑of‑Year Report</h1>

      {!portfolioId && (
        <div className="p-3 rounded-2xl bg-yellow-50 text-yellow-800 text-sm border border-yellow-200">
          We couldn’t determine a <b>portfolio</b> to upload into.
          {process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT
            ? ' Using your default ID will fix this.'
            : ' Ask an admin to assign your portfolio in Profiles or set NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT.'}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="inline-block px-4 py-2 rounded-full bg-azure/10 text-azure border border-azure/30 cursor-pointer hover:bg-azure/20 transition">
            Choose file
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {file && <span className="text-sm text-neutral-700 truncate max-w-[60%]">{file.name}</span>}
        </div>
        <div className="text-sm text-neutral-600">
          Uploading into portfolio: <span className="font-mono">{portfolioId ?? '—'}</span>
        </div>
        <button
          disabled={disabled}
          className="px-5 py-2.5 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition"
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