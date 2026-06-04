'use client';

import * as React from 'react';

export type SmallMultiplesConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
};

export default function SmallMultiplesConfig({ initialConfig, onSave, onCancel, portfolioId }: SmallMultiplesConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [window, setWindow] = React.useState(initialConfig?.config?.window || 'all');
  const [columns, setColumns] = React.useState(initialConfig?.config?.columns || 3);
  const [chartHeight, setChartHeight] = React.useState(initialConfig?.config?.chartHeight || 80);
  const [showBenchmark, setShowBenchmark] = React.useState(initialConfig?.config?.showBenchmark ?? false);
  const [benchmarkValue, setBenchmarkValue] = React.useState(initialConfig?.config?.benchmarkValue || 0);
  const [minHoldings, setMinHoldings] = React.useState(initialConfig?.config?.minHoldings || 2);
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
        // Failed to fetch metrics, form will use manual input
      }
    })();
  }, [portfolioId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title || `${metricCode} Comparison`,
      config: {
        metric_code: metricCode,
        window,
        columns,
        chartHeight,
        showBenchmark,
        benchmarkValue: showBenchmark ? benchmarkValue : undefined,
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
            placeholder="e.g., Energy Production Comparison"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
          <p className="mt-1 text-xs text-neutral-500">Leave blank to auto-generate from metric</p>
        </div>

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
          <p className="mt-1 text-xs text-neutral-500">Compare this metric across all holdings</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Time Window
          </label>
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          >
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
            <option value="24m">Last 2 years</option>
            <option value="all">All time</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Columns
            </label>
            <input
              type="number"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              min={1}
              max={6}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
            <p className="mt-1 text-xs text-neutral-500">Grid layout columns (1-6)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Chart Height
            </label>
            <input
              type="number"
              value={chartHeight}
              onChange={(e) => setChartHeight(Number(e.target.value))}
              min={40}
              max={200}
              step={10}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
            <p className="mt-1 text-xs text-neutral-500">Sparkline height (px)</p>
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

        <div className="border-t border-neutral-200 pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showBenchmark"
              checked={showBenchmark}
              onChange={(e) => setShowBenchmark(e.target.checked)}
              className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
            />
            <label htmlFor="showBenchmark" className="text-sm text-neutral-700">
              Show benchmark line
            </label>
          </div>

          {showBenchmark && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Benchmark Value
              </label>
              <input
                type="number"
                value={benchmarkValue}
                onChange={(e) => setBenchmarkValue(Number(e.target.value))}
                step="any"
                className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
              <p className="mt-1 text-xs text-neutral-500">Reference line to compare against</p>
            </div>
          )}
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
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-soft"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
