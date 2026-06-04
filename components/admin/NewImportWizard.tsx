'use client';
// components/admin/NewImportWizard.tsx
// 3-step wizard for creating a new import job

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Portfolio {
  id: string;
  name: string;
  org_id: string;
}

interface NewImportWizardProps {
  portfolios: Portfolio[];
  onClose: () => void;
}

type SourceSystem =
  | 'blackbaud_re_nxt'
  | 'salesforce_npsp'
  | 'donorperfect'
  | 'custom_csv';

const SOURCE_LABELS: Record<SourceSystem, string> = {
  blackbaud_re_nxt: 'Blackbaud RE NXT (CSV)',
  salesforce_npsp: 'Salesforce NPSP (CSV)',
  donorperfect: 'DonorPerfect (CSV)',
  custom_csv: 'Custom CSV',
};

const FILE_SLOTS = [
  { key: 'donors.csv', label: 'Donors / Constituents' },
  { key: 'investees.csv', label: 'Investees / Organizations' },
  { key: 'funds.csv', label: 'Funds / Holdings' },
  { key: 'gifts.csv', label: 'Gifts / Contributions' },
  { key: 'custom_fields.csv', label: 'Custom Fields (optional)' },
] as const;

type FileKey = (typeof FILE_SLOTS)[number]['key'];

export function NewImportWizard({ portfolios, onClose }: NewImportWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? '');
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>('blackbaud_re_nxt');
  const [files, setFiles] = useState<Partial<Record<FileKey, File>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  const handleFileChange = (key: FileKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles((prev) => ({ ...prev, [key]: file }));
    }
  };

  const handleStartImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      const selectedPortfolio = portfolios.find((p) => p.id === portfolioId);
      formData.append('name', name);
      formData.append('portfolio_id', portfolioId);
      if (selectedPortfolio?.org_id) {
        formData.append('org_id', selectedPortfolio.org_id);
      }
      formData.append('source_type', 'csv_export');

      for (const [key, file] of Object.entries(files)) {
        formData.append(key, file as File);
      }

      const res = await fetch('/api/admin/imports', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to create import job');
      }

      const { job } = await res.json();
      setCreatedJobId(job.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
          <h2 className="text-lg font-semibold">New Data Import</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 px-6 pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                s <= step ? 'bg-azure' : 'bg-neutral-200'
              }`}
            />
          ))}
        </div>

        <div className="px-6 py-5">
          {/* Step 1: Source Setup */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-500">Step 1 of 3 — Source Setup</p>

              <div>
                <label className="block text-sm font-medium mb-1">Import Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Blackbaud Migration March 2026"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Portfolio</label>
                <select
                  value={portfolioId}
                  onChange={(e) => setPortfolioId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Source System</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setSourceSystem(value as SourceSystem)}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        sourceSystem === value
                          ? 'border-azure bg-azure/5 text-azure font-medium'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Upload CSV Files</label>
                  <a
                    href="/api/admin/import/templates"
                    download
                    className="text-xs text-azure hover:underline"
                  >
                    Download sample templates
                  </a>
                </div>
                <div className="space-y-2">
                  {FILE_SLOTS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed border-neutral-300 rounded-lg cursor-pointer hover:border-azure/50 transition-colors text-sm">
                        <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        <span className="text-neutral-500 truncate">
                          {files[key] ? files[key]!.name : label}
                        </span>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={handleFileChange(key)}
                        />
                      </label>
                      <a
                        href={`/api/admin/import/templates/${key}`}
                        download={key}
                        className="text-neutral-400 hover:text-azure text-xs shrink-0"
                        title={`Download ${label} template`}
                      >
                        sample
                      </a>
                      {files[key] && (
                        <button
                          onClick={() => setFiles((prev) => { const next = { ...prev }; delete next[key]; return next; })}
                          className="text-neutral-400 hover:text-red-500"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-500">Step 2 of 3 — Field Mapping</p>
              <div className="p-4 bg-azure/5 border border-azure/20 rounded-lg text-sm">
                <p className="font-medium text-azure mb-1">
                  Using default mapping for {SOURCE_LABELS[sourceSystem]}
                </p>
                <p className="text-neutral-600">
                  The standard field mapping profile for {SOURCE_LABELS[sourceSystem]} will be applied automatically.
                  You can review and customize individual field mappings after the import is created.
                </p>
              </div>
              <p className="text-xs text-neutral-500">
                After import creation, use the Mapping tab to review and adjust field assignments.
              </p>
            </div>
          )}

          {/* Step 3: Confirmation / Result */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-500">Step 3 of 3 — Confirmation</p>
              {loading ? (
                <div className="flex items-center gap-3 py-4 text-neutral-600 text-sm">
                  <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
                  Starting import...
                </div>
              ) : createdJobId ? (
                <div className="space-y-3">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <p className="font-medium text-green-800 mb-1">Import started successfully</p>
                    <p className="text-green-700 font-mono text-xs">Job ID: {createdJobId}</p>
                  </div>
                  <a
                    href={`/admin/imports/${createdJobId}`}
                    className="block text-center px-4 py-2 rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    onClick={onClose}
                  >
                    View Import Progress →
                  </a>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <p className="font-medium mb-1">Import failed to start</p>
                  <p>{error}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6">
          <button
            onClick={() => (step > 1 && step < 3 ? setStep(step - 1) : onClose)}
            className="px-4 py-2 text-sm rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            {step === 3 ? 'Close' : step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!name || Object.keys(files).length === 0}
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Next: Configure Mapping →
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleStartImport}
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 transition-opacity"
            >
              Start Import
            </button>
          )}

          {step === 3 && createdJobId && (
            <button
              onClick={() => {
                router.refresh();
                onClose();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
