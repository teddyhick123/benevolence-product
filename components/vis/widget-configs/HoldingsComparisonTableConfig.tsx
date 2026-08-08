'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import * as React from 'react';

export type HoldingsComparisonTableConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

export default function HoldingsComparisonTableConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: HoldingsComparisonTableConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [selectedMetrics, setSelectedMetrics] = React.useState<string[]>(initialConfig?.config?.metrics || []);
  const [includeHoldingName, setIncludeHoldingName] = React.useState(initialConfig?.config?.includeHoldingName ?? true);
  const [includeSector, setIncludeSector] = React.useState(initialConfig?.config?.includeSector ?? true);
  const [sortBy, setSortBy] = React.useState(initialConfig?.config?.sortBy || 'name');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(initialConfig?.config?.sortDirection || 'asc');
  const [highlightBest, setHighlightBest] = React.useState(initialConfig?.config?.highlightBest ?? true);
  const [minHoldings, setMinHoldings] = React.useState(initialConfig?.config?.minHoldings || 2);
  const [availableMetrics, setAvailableMetrics] = React.useState<Array<{ metric_code: string; display_name: string }>>([]);

  // Fetch available metrics
  React.useEffect(() => {
    if (!portfolioId) return;
    (async () => {
      try {
        const res = await apiRequest(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpis?has_data=true`, { cache: 'no-store' });
        const json = await readJson(res);
        if (json.data) {
          setAvailableMetrics(json.data.map((kpi: any) => ({
            metric_code: kpi.metric_code,
            display_name: kpi.display_name || kpi.metric_code
          })));
        }
      } catch (e) {
        // Failed to fetch metrics
      }
    })();
  }, [portfolioId]);

  const handleMetricToggle = (metricCode: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metricCode)) {
        return prev.filter(m => m !== metricCode);
      } else {
        return [...prev, metricCode];
      }
    });
  };

  React.useEffect(() => {
    onPreviewChange?.({
      title: title || 'Holdings Comparison',
      config: {
        metrics: selectedMetrics,
        includeHoldingName,
        includeSector,
        sortBy,
        sortDirection,
        highlightBest,
        minHoldings
      }
    });
  }, [highlightBest, includeHoldingName, includeSector, minHoldings, onPreviewChange, selectedMetrics, sortBy, sortDirection, title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title || 'Holdings Comparison',
      config: {
        metrics: selectedMetrics,
        includeHoldingName,
        includeSector,
        sortBy,
        sortDirection,
        highlightBest,
        minHoldings
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Widget Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Holdings Performance Comparison"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Select Metrics to Compare <span className="text-red-500">*</span>
          </label>
          {availableMetrics.length > 0 ? (
            <div className="border border-neutral-300 rounded-2xl p-3 max-h-48 overflow-y-auto space-y-2">
              {availableMetrics.map(m => (
                <label key={m.metric_code} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.metric_code)}
                    onChange={() => handleMetricToggle(m.metric_code)}
                    className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
                  />
                  <span className="text-sm text-neutral-700">{m.display_name} ({m.metric_code})</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 border border-neutral-200 rounded-2xl p-3">
              Loading metrics...
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">Select at least 1 metric to display</p>
        </div>

        <div className="space-y-3 border-t border-neutral-200 pt-4">
          <p className="text-sm font-medium text-neutral-700">Display Options</p>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="includeHoldingName"
              checked={includeHoldingName}
              onChange={(e) => setIncludeHoldingName(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="includeHoldingName" className="text-sm text-neutral-700">
              Show holding name column
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="includeSector"
              checked={includeSector}
              onChange={(e) => setIncludeSector(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="includeSector" className="text-sm text-neutral-700">
              Show sector column
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="highlightBest"
              checked={highlightBest}
              onChange={(e) => setHighlightBest(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="highlightBest" className="text-sm text-neutral-700">
              Highlight best values
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Default Sort Column
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="name">Holding Name</option>
              {selectedMetrics.map(metric => (
                <option key={metric} value={metric}>{metric}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Sort Direction
            </label>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Minimum Holdings
          </label>
          <input
            type="number"
            value={minHoldings}
            onChange={(e) => setMinHoldings(Number(e.target.value))}
            min={1}
            max={10}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
          <p className="mt-1 text-xs text-neutral-500">Minimum holdings required to display widget</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={selectedMetrics.length === 0}
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
