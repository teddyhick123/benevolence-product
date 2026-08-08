'use client';

import { requestDownload } from "@/lib/api/client";

import * as React from 'react';

export interface TaxExportButtonProps {
  portfolioId: string;
  year?: number;
  variant?: 'button' | 'dropdown';
}

type ExportFormat = 'json' | 'csv' | 'xlsx' | 'txf' | 'form8283' | 'carryforward' | 'pdf';

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  recommended?: boolean;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'txf',
    label: 'TurboTax (TXF)',
    description: 'Import directly into TurboTax, TaxAct, or H&R Block',
    recommended: true,
  },
  {
    format: 'form8283',
    label: 'Form 8283 Summary',
    description: 'Summary for non-cash contributions over $500',
  },
  {
    format: 'carryforward',
    label: 'Carryforward Schedule',
    description: '5-year carryforward tracking report',
  },
  {
    format: 'csv',
    label: 'CSV Export',
    description: 'Spreadsheet-compatible format',
  },
  {
    format: 'xlsx',
    label: 'Excel Workbook',
    description: 'Full report with multiple sheets',
  },
  {
    format: 'pdf',
    label: 'PDF Report',
    description: 'Formatted tax summary PDF for records',
  },
  {
    format: 'json',
    label: 'JSON (API)',
    description: 'Structured data for developers',
  },
];

export default function TaxExportButton({
  portfolioId,
  year = new Date().getFullYear(),
  variant = 'dropdown',
}: TaxExportButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExport(format: ExportFormat) {
    setExporting(true);
    setError(null);

    try {
      const url = `/api/portfolio/${portfolioId}/tax/export?year=${year}&format=${format}`;
      const download = await requestDownload(url);
      const filename = download.filename ?? `tax-export-${year}.${format}`;
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
      console.error('Export error:', err);
      setError(err.message || 'Failed to export tax data');
    } finally {
      setExporting(false);
    }
  }

  if (variant === 'button') {
    return (
      <button
        onClick={() => handleExport('txf')}
        disabled={exporting}
        className="px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? 'Exporting...' : 'Export for TurboTax'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-2xl hover:bg-neutral-50 transition-colors font-medium shadow-sm flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export Tax Data</span>
        <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 mt-2 w-96 bg-white border border-neutral-200 rounded-2xl shadow-lg z-20">
            <div className="p-4 border-b border-neutral-200">
              <h3 className="font-semibold text-neutral-900">
                Export Tax Data — {year}
              </h3>
              <p className="text-sm text-neutral-600 mt-1">
                Choose a format for your tax records
              </p>
            </div>

            {error && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="p-2 max-h-96 overflow-y-auto">
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  onClick={() => handleExport(option.format)}
                  disabled={exporting}
                  className="w-full text-left p-3 rounded-2xl hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-neutral-900 group-hover:text-azure">
                          {option.label}
                        </p>
                        {option.recommended && (
                          <span className="px-2 py-0.5 bg-azure/10 text-azure-deep text-xs font-medium rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 rounded-b-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-neutral-600">
                  All export formats include your contributions, deductions, and carryforwards.
                  TXF files can be imported directly into tax preparation software.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
