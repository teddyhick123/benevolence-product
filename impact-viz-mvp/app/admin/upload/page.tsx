'use client';
import React, { useState } from 'react';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setStatus('Uploading...');
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    const data = await res.json();
    setStatus(`Uploaded file_id=${data.fileId}. Kicking off extraction...`);
    const ex = await fetch(`/api/admin/extract/${data.fileId}`, { method: 'POST' });
    const job = await ex.json();
    setStatus(`Extraction started (job_id=${job.jobId}).`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin • Upload Center</h1>
      <form onSubmit={onSubmit} className="border rounded-xl p-4 space-y-3 bg-white">
        <input type="file" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
        <button className="px-3 py-2 bg-blue-600 text-white rounded">Upload & Extract</button>
      </form>
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}
