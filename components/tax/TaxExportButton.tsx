'use client';

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
  icon: string;
  recommended?: boolean;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'txf',
    label: 'TurboTax (TXF)',
    description: 'Import directly into TurboTax, TaxAct, or H&R Block',
    icon: '📥',
    recommended: true,
  },
  {
    format: 'form8283',
    label: 'Form 8283 Summary',
    description: 'Summary for non-cash contributions over $500',
    icon: '📋',
  },
  {
    format: 'carryforward',
    label: 'Carryforward Schedule',
    description: '5-year carryforward tracking report',
    icon: '📅',
  },
  {
    format: 'csv',
    label: 'CSV Export',
    description: 'Spreadsheet-compatible format',
    icon: '📊',
  },
  {
    format: 'xlsx',
    label: 'Excel Workbook',
    description: 'Full report with multiple sheets',
    icon: '📗',
  },
  {
    format: 'pdf',
    label: 'PDF Report',
    description: 'Formatted tax summary PDF for records',
    icon: '📄',
  },
  {
    format: 'json',
    label: 'JSON (API)',
    description: 'Structured data for developers',
    icon: '💻',
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
      const res = await fetch(url);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get filename from Content-Disposition header or create default
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `tax-export-${year}.${format}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download file
      const blob = await res.blob();
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
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? 'Exporting...' : 'Export for TurboTax'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium shadow-sm flex items-center gap-2"
      >
        <span>📤</span>
        <span>Export Tax Data</span>
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-2 w-96 bg-white border border-neutral-200 rounded-lg shadow-lg z-20">
            <div className="p-4 border-b border-neutral-200">
              <h3 className="font-semibold text-neutral-900">
                Export Tax Data - {year}
              </h3>
              <p className="text-sm text-neutral-600 mt-1">
                Choose a format for your tax records
              </p>
            </div>

            {error && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="p-2 max-h-96 overflow-y-auto">
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  onClick={() => handleExport(option.format)}
                  disabled={exporting}
                  className="w-full text-left p-3 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{option.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-neutral-900 group-hover:text-indigo-600">
                          {option.label}
                        </p>
                        {option.recommended && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
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
                <span className="text-lg">ℹ️</span>
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
