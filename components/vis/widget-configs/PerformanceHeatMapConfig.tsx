'use client';

import * as React from 'react';

export type PerformanceHeatMapConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

export default function PerformanceHeatMapConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: PerformanceHeatMapConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [mode, setMode] = React.useState<'temporal' | 'metrics'>(initialConfig?.config?.mode || 'temporal');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [selectedMetrics, setSelectedMetrics] = React.useState<string[]>(initialConfig?.config?.metrics || []);
  const [window, setWindow] = React.useState(initialConfig?.config?.window || 'all');
  const [colorScheme, setColorScheme] = React.useState<'sequential' | 'diverging'>(initialConfig?.config?.colorScheme || 'sequential');
  const [minColor, setMinColor] = React.useState(initialConfig?.config?.minColor || '#dbeafe');
  const [maxColor, setMaxColor] = React.useState(initialConfig?.config?.maxColor || '#1e40af');
  const [midColor, setMidColor] = React.useState(initialConfig?.config?.midColor || '#ffffff');
  const [showValues, setShowValues] = React.useState(initialConfig?.config?.showValues ?? true);
  const [availableMetrics, setAvailableMetrics] = React.useState<Array<{ metric_code: string; display_name: string }>>([]);

  // Fetch available metrics
  React.useEffect(() => {
    if (!portfolioId) return;
    (async () => {
      try {
        const res = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/kpis?has_data=true`, { cache: 'no-store' });
        const json = await res.json();
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
    const config: any = {
      mode,
      window,
      colorScheme,
      minColor,
      maxColor,
      showValues
    };

    if (mode === 'temporal') {
      config.metric_code = metricCode;
    } else {
      config.metrics = selectedMetrics;
    }

    if (colorScheme === 'diverging') {
      config.midColor = midColor;
    }

    onPreviewChange?.({
      title: title || 'Performance Heat Map',
      config
    });
  }, [colorScheme, maxColor, metricCode, midColor, minColor, mode, onPreviewChange, selectedMetrics, showValues, title, window]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: any = {
      mode,
      window,
      colorScheme,
      minColor,
      maxColor,
      showValues
    };

    if (mode === 'temporal') {
      config.metric_code = metricCode;
    } else {
      config.metrics = selectedMetrics;
    }

    if (colorScheme === 'diverging') {
      config.midColor = midColor;
    }

    onSave({
      title: title || `Performance Heat Map`,
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
            placeholder="e.g., Performance Heat Map"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Display Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'temporal' | 'metrics')}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          >
            <option value="temporal">Temporal - One metric over time</option>
            <option value="metrics">Metrics - Multiple metrics per holding</option>
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            {mode === 'temporal' ? 'Show how one metric changes over time' : 'Compare multiple metrics across holdings'}
          </p>
        </div>

        {mode === 'temporal' ? (
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
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Select Metrics <span className="text-red-500">*</span>
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
            <p className="mt-1 text-xs text-neutral-500">Select at least 2 metrics</p>
          </div>
        )}

        {mode === 'temporal' && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Time Window
            </label>
            <select
              value={window}
              onChange={(e) => setWindow(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="24m">Last 2 years</option>
              <option value="all">All time</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Color Scheme
          </label>
          <select
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value as 'sequential' | 'diverging')}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          >
            <option value="sequential">Sequential (low to high)</option>
            <option value="diverging">Diverging (low - mid - high)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Min Color
            </label>
            <input
              type="color"
              value={minColor}
              onChange={(e) => setMinColor(e.target.value)}
              className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Max Color
            </label>
            <input
              type="color"
              value={maxColor}
              onChange={(e) => setMaxColor(e.target.value)}
              className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
            />
          </div>

          {colorScheme === 'diverging' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Mid Color
              </label>
              <input
                type="color"
                value={midColor}
                onChange={(e) => setMidColor(e.target.value)}
                className="w-full h-10 px-2 border border-neutral-300 rounded-2xl"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="showValues"
            checked={showValues}
            onChange={(e) => setShowValues(e.target.checked)}
            className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
          />
          <label htmlFor="showValues" className="text-sm text-neutral-700">
            Show values in cells
          </label>
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
          disabled={mode === 'metrics' && selectedMetrics.length < 2}
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
