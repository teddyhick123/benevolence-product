'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import * as React from 'react';

export type WaterfallChartConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

export default function WaterfallChartConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: WaterfallChartConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [mode, setMode] = React.useState<'funding' | 'impact' | 'metric'>(initialConfig?.config?.mode || 'funding');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metricCode || '');
  const [increaseColor, setIncreaseColor] = React.useState(initialConfig?.config?.increaseColor || '#10b981');
  const [decreaseColor, setDecreaseColor] = React.useState(initialConfig?.config?.decreaseColor || '#ef4444');
  const [totalColor, setTotalColor] = React.useState(initialConfig?.config?.totalColor || '#3b82f6');
  const [showLabels, setShowLabels] = React.useState(initialConfig?.config?.showLabels ?? true);
  const [showConnectors, setShowConnectors] = React.useState(initialConfig?.config?.showConnectors ?? true);
  const [minItems, setMinItems] = React.useState(initialConfig?.config?.minItems || 3);
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

  React.useEffect(() => {
    const config: any = {
      mode,
      increaseColor,
      decreaseColor,
      totalColor,
      showLabels,
      showConnectors,
      minItems
    };

    if (mode === 'metric') {
      config.metricCode = metricCode;
    }

    onPreviewChange?.({
      title: title || (mode === 'funding' ? 'Fund Allocation' : mode === 'impact' ? 'Impact Accumulation' : 'Metric Accumulation'),
      config
    });
  }, [decreaseColor, increaseColor, metricCode, minItems, mode, onPreviewChange, showConnectors, showLabels, title, totalColor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: any = {
      mode,
      increaseColor,
      decreaseColor,
      totalColor,
      showLabels,
      showConnectors,
      minItems
    };

    if (mode === 'metric') {
      config.metricCode = metricCode;
    }

    onSave({
      title: title || (mode === 'funding' ? 'Fund Allocation' : mode === 'impact' ? 'Impact Accumulation' : 'Metric Accumulation'),
      config
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
            placeholder="e.g., Fund Allocation Waterfall"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Waterfall Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'funding' | 'impact' | 'metric')}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          >
            <option value="funding">Funding - Show fund allocation flow</option>
            <option value="impact">Impact - Show cumulative impact</option>
            <option value="metric">Metric - Show metric accumulation</option>
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            {mode === 'funding' && 'Visualize how funds are allocated across holdings'}
            {mode === 'impact' && 'Track cumulative impact contributions'}
            {mode === 'metric' && 'Show how a metric accumulates across holdings'}
          </p>
        </div>

        {mode === 'metric' && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Metric Code <span className="text-red-500">*</span>
            </label>
            {availableMetrics.length > 0 ? (
              <select
                value={metricCode}
                onChange={(e) => setMetricCode(e.target.value)}
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                <option value="">Select a metric...</option>
                {availableMetrics.map(m => (
                  <option key={m.metric_code} value={m.metric_code}>
                    {m.display_name} ({m.metric_code})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={metricCode}
                onChange={(e) => setMetricCode(e.target.value.toUpperCase())}
                placeholder="e.g., RENEWABLE_MWH"
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            )}
            <p className="mt-1 text-xs text-neutral-500">Metric to accumulate across holdings</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Color Scheme
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Increase</label>
              <input
                type="color"
                value={increaseColor}
                onChange={(e) => setIncreaseColor(e.target.value)}
                className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Decrease</label>
              <input
                type="color"
                value={decreaseColor}
                onChange={(e) => setDecreaseColor(e.target.value)}
                className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Total</label>
              <input
                type="color"
                value={totalColor}
                onChange={(e) => setTotalColor(e.target.value)}
                className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showLabels"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="showLabels" className="text-sm text-neutral-700">
              Show value labels on bars
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showConnectors"
              checked={showConnectors}
              onChange={(e) => setShowConnectors(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="showConnectors" className="text-sm text-neutral-700">
              Show connector lines between bars
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Minimum Items
          </label>
          <input
            type="number"
            value={minItems}
            onChange={(e) => setMinItems(Number(e.target.value))}
            min={2}
            max={10}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
          <p className="mt-1 text-xs text-neutral-500">Minimum items required to display widget</p>
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
          disabled={mode === 'metric' && !metricCode}
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
