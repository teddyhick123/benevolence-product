'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import * as React from 'react';

export type ImpactBubbleChartConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

export default function ImpactBubbleChartConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: ImpactBubbleChartConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [xMetric, setXMetric] = React.useState(initialConfig?.config?.xMetric || '');
  const [yMetric, setYMetric] = React.useState(initialConfig?.config?.yMetric || '');
  const [sizeMetric, setSizeMetric] = React.useState(initialConfig?.config?.sizeMetric || '');
  const [colorMode, setColorMode] = React.useState<'metric' | 'sector'>(initialConfig?.config?.colorMode || 'sector');
  const [colorMetric, setColorMetric] = React.useState(initialConfig?.config?.colorMetric || '');
  const [minBubbleSize, setMinBubbleSize] = React.useState(initialConfig?.config?.minBubbleSize || 10);
  const [maxBubbleSize, setMaxBubbleSize] = React.useState(initialConfig?.config?.maxBubbleSize || 50);
  const [showLabels, setShowLabels] = React.useState(initialConfig?.config?.showLabels ?? false);
  const [xLabel, setXLabel] = React.useState(initialConfig?.config?.xLabel || '');
  const [yLabel, setYLabel] = React.useState(initialConfig?.config?.yLabel || '');
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

  React.useEffect(() => {
    const config: any = {
      xMetric,
      yMetric,
      sizeMetric,
      colorMode,
      minBubbleSize,
      maxBubbleSize,
      showLabels,
      minHoldings
    };

    if (colorMode === 'metric' && colorMetric) {
      config.colorMetric = colorMetric;
    }

    if (xLabel) config.xLabel = xLabel;
    if (yLabel) config.yLabel = yLabel;

    onPreviewChange?.({
      title: title || 'Impact Bubble Chart',
      config
    });
  }, [colorMetric, colorMode, maxBubbleSize, minBubbleSize, minHoldings, onPreviewChange, showLabels, sizeMetric, title, xLabel, xMetric, yLabel, yMetric]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: any = {
      xMetric,
      yMetric,
      sizeMetric,
      colorMode,
      minBubbleSize,
      maxBubbleSize,
      showLabels,
      minHoldings
    };

    if (colorMode === 'metric' && colorMetric) {
      config.colorMetric = colorMetric;
    }

    if (xLabel) config.xLabel = xLabel;
    if (yLabel) config.yLabel = yLabel;

    onSave({
      title: title || 'Impact Bubble Chart',
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
            placeholder="e.g., Multi-Dimensional Impact Analysis"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div className="border border-neutral-200 rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Axis Configuration</h3>
          <p className="text-xs text-neutral-600">Select metrics for X, Y, and bubble size dimensions</p>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              X-Axis Metric <span className="text-red-500">*</span>
            </label>
            {availableMetrics.length > 0 ? (
              <select
                value={xMetric}
                onChange={(e) => setXMetric(e.target.value)}
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                <option value="">Select X-axis metric...</option>
                {availableMetrics.map(m => (
                  <option key={m.metric_code} value={m.metric_code}>
                    {m.display_name} ({m.metric_code})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={xMetric}
                onChange={(e) => setXMetric(e.target.value.toUpperCase())}
                placeholder="e.g., REVENUE"
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            )}
            <input
              type="text"
              value={xLabel}
              onChange={(e) => setXLabel(e.target.value)}
              placeholder="Custom X-axis label (optional)"
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure mt-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Y-Axis Metric <span className="text-red-500">*</span>
            </label>
            {availableMetrics.length > 0 ? (
              <select
                value={yMetric}
                onChange={(e) => setYMetric(e.target.value)}
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                <option value="">Select Y-axis metric...</option>
                {availableMetrics.map(m => (
                  <option key={m.metric_code} value={m.metric_code}>
                    {m.display_name} ({m.metric_code})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={yMetric}
                onChange={(e) => setYMetric(e.target.value.toUpperCase())}
                placeholder="e.g., IMPACT_SCORE"
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            )}
            <input
              type="text"
              value={yLabel}
              onChange={(e) => setYLabel(e.target.value)}
              placeholder="Custom Y-axis label (optional)"
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure mt-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Bubble Size Metric <span className="text-red-500">*</span>
            </label>
            {availableMetrics.length > 0 ? (
              <select
                value={sizeMetric}
                onChange={(e) => setSizeMetric(e.target.value)}
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                <option value="">Select size metric...</option>
                {availableMetrics.map(m => (
                  <option key={m.metric_code} value={m.metric_code}>
                    {m.display_name} ({m.metric_code})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={sizeMetric}
                onChange={(e) => setSizeMetric(e.target.value.toUpperCase())}
                placeholder="e.g., EMPLOYEES"
                required
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            )}
            <p className="mt-1 text-xs text-neutral-500">Metric determines bubble size</p>
          </div>
        </div>

        <div className="border border-neutral-200 rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Color Configuration</h3>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Color Mode
            </label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as 'metric' | 'sector')}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="sector">By Sector - Color bubbles by industry sector</option>
              <option value="metric">By Metric - Color bubbles by metric value</option>
            </select>
          </div>

          {colorMode === 'metric' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Color Metric
              </label>
              {availableMetrics.length > 0 ? (
                <select
                  value={colorMetric}
                  onChange={(e) => setColorMetric(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                >
                  <option value="">Select color metric (optional)...</option>
                  {availableMetrics.map(m => (
                    <option key={m.metric_code} value={m.metric_code}>
                      {m.display_name} ({m.metric_code})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={colorMetric}
                  onChange={(e) => setColorMetric(e.target.value.toUpperCase())}
                  placeholder="e.g., GROWTH_RATE"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              )}
              <p className="mt-1 text-xs text-neutral-500">Fourth dimension - optional metric for color intensity</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Min Bubble Size
            </label>
            <input
              type="number"
              value={minBubbleSize}
              onChange={(e) => setMinBubbleSize(Number(e.target.value))}
              min={5}
              max={30}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
            <p className="mt-1 text-xs text-neutral-500">Pixels (5-30)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Max Bubble Size
            </label>
            <input
              type="number"
              value={maxBubbleSize}
              onChange={(e) => setMaxBubbleSize(Number(e.target.value))}
              min={30}
              max={100}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
            <p className="mt-1 text-xs text-neutral-500">Pixels (30-100)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="showLabels"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
          />
          <label htmlFor="showLabels" className="text-sm text-neutral-700">
            Show holding names on bubbles
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Minimum Holdings
          </label>
          <input
            type="number"
            value={minHoldings}
            onChange={(e) => setMinHoldings(Number(e.target.value))}
            min={2}
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
          disabled={!xMetric || !yMetric || !sizeMetric}
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
