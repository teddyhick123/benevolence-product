'use client';

import { useState } from 'react';

interface TaxExportPanelProps {
  portfolioId: string;
  taxYear: number;
}

export default function TaxExportPanel({ portfolioId, taxYear }: TaxExportPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: 'csv' | 'xlsx' | 'print' | 'form8283' | 'turbotax') {
    if (format === 'print') {
      // Open printable view in new window
      window.open(
        `/dashboard/tax/print?portfolioId=${portfolioId}&year=${taxYear}`,
        '_blank'
      );
      return;
    }

    try {
      setExporting(format);
      setError(null);

      let url: string;
      let defaultFilename: string;

      if (format === 'form8283') {
        url = `/api/portfolio/${portfolioId}/tax/form8283?year=${taxYear}`;
        defaultFilename = `Form-8283-${taxYear}.pdf`;
      } else if (format === 'turbotax') {
        url = `/api/portfolio/${portfolioId}/tax/export?year=${taxYear}&format=txf`;
        defaultFilename = `charitable-contributions-${taxYear}.txf`;
      } else {
        url = `/api/portfolio/${portfolioId}/tax/export?year=${taxYear}&format=${format}`;
        defaultFilename = `tax-summary-${taxYear}.${format}`;
      }

      const res = await fetch(url);

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Export failed');
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || defaultFilename;

      // Download the file
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Export Tax Summary</h2>
          <p className="text-sm text-gray-600 mt-1">
            Download your {taxYear} tax data for your accountant or records
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Phase 2 & 3: Professional Tax Software Exports */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Professional Tax Software</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Form 8283 PDF */}
            <button
              onClick={() => handleExport('form8283')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 border-2 border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-indigo-100 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-indigo-900">
                  {exporting === 'form8283' ? 'Generating...' : 'Form 8283 PDF'}
                </div>
                <div className="text-xs text-indigo-700">IRS noncash contributions</div>
              </div>
            </button>

            {/* TurboTax TXF */}
            <button
              onClick={() => handleExport('turbotax')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 border-2 border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-indigo-100 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-indigo-900">
                  {exporting === 'turbotax' ? 'Exporting...' : 'TurboTax (.txf)'}
                </div>
                <div className="text-xs text-indigo-700">Direct import to TurboTax</div>
              </div>
            </button>
          </div>
        </div>

        {/* General Exports */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">General Exports</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Excel Export */}
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {exporting === 'xlsx' ? 'Exporting...' : 'Excel (.xlsx)'}
                </div>
                <div className="text-xs text-gray-500">Multi-sheet workbook</div>
              </div>
            </button>

            {/* CSV Export */}
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-azure/10 rounded-lg">
                <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {exporting === 'csv' ? 'Exporting...' : 'CSV File'}
                </div>
                <div className="text-xs text-gray-500">Simple spreadsheet</div>
              </div>
            </button>

            {/* Print/PDF */}
            <button
              onClick={() => handleExport('print')}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">Print / PDF</div>
                <div className="text-xs text-gray-500">Formatted report</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <strong>Tip:</strong> Use Excel for detailed analysis. Print/PDF includes a formatted summary
        suitable for sharing with your tax professional.
      </div>
    </div>
  );
}
