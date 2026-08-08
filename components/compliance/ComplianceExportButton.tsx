'use client';

import { requestDownload } from "@/lib/api/client";

import * as React from 'react';

interface Props {
  portfolioId: string;
  taxYear: number;
}

interface ExportOption {
  id: string;
  label: string;
  description: string;
  url: (portfolioId: string, year: number) => string;
  filename: (year: number) => string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: '990pf_json',
    label: '990-PF Data (JSON)',
    description: 'Structured data by Part for tax preparer',
    url: (id, y) => `/api/portfolio/${id}/compliance/990pf-export?year=${y}&format=json`,
    filename: y => `990pf-data-${y}.json`,
  },
  {
    id: 'distributions_csv',
    label: 'Qualifying Distributions (CSV)',
    description: 'Itemized payout ledger for the tax year',
    url: (id, y) => `/api/portfolio/${id}/compliance/990pf-export?year=${y}&format=csv`,
    filename: y => `qualifying-distributions-${y}.csv`,
  },
];

export default function ComplianceExportButton({ portfolioId, taxYear }: Props) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExport(option: ExportOption) {
    setExporting(option.id);
    setError(null);
    try {
      const { blob } = await requestDownload(option.url(portfolioId, taxYear));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = option.filename(taxYear);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setIsOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm shadow-sm flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="p-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Export Compliance Data</h3>
              <p className="text-xs text-gray-500 mt-0.5">Tax year {taxYear}</p>
            </div>
            {error && (
              <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
            )}
            <div className="p-2">
              {EXPORT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleExport(opt)}
                  disabled={exporting !== null}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 text-azure flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                    </div>
                    {exporting === opt.id && (
                      <svg className="w-4 h-4 animate-spin text-azure ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
