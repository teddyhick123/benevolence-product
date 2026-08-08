'use client';

import { requestDownload } from "@/lib/api/client";

import * as React from 'react';

export interface GrantExportButtonProps {
  portfolioId: string;
  grantId?: string;
}

type ExportFormat = 'csv' | 'json' | 'xlsx';

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { format: 'csv', label: 'CSV Export', description: 'Spreadsheet-compatible, includes all sheets' },
  { format: 'xlsx', label: 'Excel Workbook', description: 'Multi-sheet workbook with milestones & payments' },
  { format: 'json', label: 'JSON (API)', description: 'Structured data for developers' },
];

export default function GrantExportButton({ portfolioId, grantId }: GrantExportButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExport(format: ExportFormat) {
    setExporting(true);
    setError(null);

    try {
      let url = `/api/portfolio/${portfolioId}/grants/export?format=${format}`;
      if (grantId) url += `&grantId=${grantId}`;

      const dateStr = new Date().toISOString().split('T')[0];
      const download = await requestDownload(url);
      const filename = download.filename ?? `grants-export-${dateStr}.${format}`;
      const { blob } = download;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setIsOpen(false);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50 transition-colors font-medium text-sm shadow-sm flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-black/5 rounded-2xl shadow-xl z-20">
            <div className="p-4 border-b border-black/5">
              <h3 className="font-semibold text-ink text-sm">
                Export Grant Data
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {grantId ? 'Single grant export' : 'Portfolio-wide export'}
              </p>
            </div>

            {error && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="p-2">
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  onClick={() => handleExport(option.format)}
                  disabled={exporting}
                  className="w-full text-left p-3 rounded-2xl hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {option.format === 'csv' && (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      {option.format === 'xlsx' && (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                      {option.format === 'json' && (
                        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{option.label}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {exporting && (
              <div className="px-4 pb-3 text-xs text-neutral-500 text-center">
                Preparing export...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
