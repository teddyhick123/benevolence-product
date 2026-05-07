'use client';

import { useState } from 'react';
import useSWR from 'swr';

type Holding = {
  id: string;
  name: string;
};

interface Props {
  portfolioId: string;
  onClose: () => void;
  onSuccess?: (exportData: any) => void;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const DATA_TYPES = [
  { value: 'holdings', label: 'Holdings', description: 'All holdings with their details' },
  { value: 'metrics', label: 'Metrics', description: 'KPI data points over time' },
  { value: 'contributions', label: 'Contributions', description: 'Donation records' },
  { value: 'transactions', label: 'Transactions', description: 'Transaction history' },
];

const FORMATS = [
  { value: 'csv', label: 'CSV', description: 'Comma-separated values' },
  { value: 'json', label: 'JSON', description: 'JavaScript Object Notation' },
  { value: 'xlsx', label: 'Excel', description: 'Microsoft Excel format' },
];

export default function ExportDataModal({ portfolioId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<any>(null);

  // Form state
  const [dataType, setDataType] = useState('holdings');
  const [format, setFormat] = useState('csv');
  const [holdingId, setHoldingId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [saveDocument, setSaveDocument] = useState(false);

  // Fetch holdings for filter
  const { data: holdingsData } = useSWR<{ data: Holding[] }>(
    `/api/portfolio/${portfolioId}/holdings`,
    fetcher
  );

  const holdings = holdingsData?.data || [];

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    setExportResult(null);

    try {
      const response = await fetch(`/api/portfolio/${portfolioId}/reports/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_type: dataType,
          format,
          holding_id: holdingId || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          save_document: saveDocument,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      const result = await response.json();
      setExportResult(result.export);
      onSuccess?.(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!exportResult) return;

    const blob = new Blob([exportResult.content], { type: exportResult.content_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const showDateFilters = dataType === 'metrics' || dataType === 'contributions' || dataType === 'transactions';
  const showHoldingFilter = dataType === 'metrics';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Export Data</h2>
          <p className="text-sm text-gray-500 mt-1">Download your portfolio data in various formats</p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {!exportResult ? (
            <>
              {/* Data Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DATA_TYPES.map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => setDataType(dt.value)}
                      className={`p-3 text-left border rounded-lg transition-colors ${
                        dataType === dt.value
                          ? 'border-azure bg-azure/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${dataType === dt.value ? 'text-azure' : 'text-gray-900'}`}>
                        {dt.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{dt.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Format
                </label>
                <div className="flex gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFormat(f.value)}
                      className={`flex-1 p-3 text-center border rounded-lg transition-colors ${
                        format === f.value
                          ? 'border-azure bg-azure/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${format === f.value ? 'text-azure' : 'text-gray-900'}`}>
                        {f.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Filters */}
              {showHoldingFilter && holdings.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Holding (optional)
                  </label>
                  <select
                    value={holdingId}
                    onChange={(e) => setHoldingId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
                  >
                    <option value="">All holdings</option>
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {showDateFilters && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Date (optional)
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Date (optional)
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
                    />
                  </div>
                </div>
              )}

              {/* Save Option */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={saveDocument}
                    onChange={(e) => setSaveDocument(e.target.checked)}
                    className="rounded text-azure"
                  />
                  <span className="text-sm text-gray-700">Save to document history</span>
                </label>
              </div>
            </>
          ) : (
            /* Export Result */
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Export Ready</h3>
              <p className="text-sm text-gray-500 mt-1">
                {exportResult.row_count} rows exported as {exportResult.format.toUpperCase()}
              </p>
              <p className="text-xs text-gray-400 mt-2">{exportResult.filename}</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            {exportResult ? 'Close' : 'Cancel'}
          </button>
          {exportResult ? (
            <button
              onClick={handleDownload}
              className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
            >
              Download
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={loading}
              className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50"
            >
              {loading ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
