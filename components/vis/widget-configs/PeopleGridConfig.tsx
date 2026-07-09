'use client';

import * as React from 'react';

export type PeopleGridConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

export default function PeopleGridConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: PeopleGridConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || 'People Helped');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [mode, setMode] = React.useState(initialConfig?.config?.mode || 'sum');
  const [window, setWindow] = React.useState(initialConfig?.config?.window || '12m');
  const [perUnit, setPerUnit] = React.useState(initialConfig?.config?.perUnit || 10);
  const [target, setTarget] = React.useState(initialConfig?.config?.target || '');
  const [availableMetrics, setAvailableMetrics] = React.useState<Array<{ metric_code: string; display_name: string }>>([]);

  // Fetch available metrics (only those with actual data)
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

  React.useEffect(() => {
    onPreviewChange?.({
      title,
      config: {
        metric_code: metricCode,
        mode,
        window,
        perUnit: Number(perUnit || 1),
        iconSize: 16,
        target: target ? Number(target) : undefined
      }
    });
  }, [metricCode, mode, onPreviewChange, perUnit, target, title, window]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title,
      config: {
        metric_code: metricCode,
        mode,
        window,
        perUnit: Number(perUnit),
        iconSize: 16,
        target: target ? Number(target) : undefined
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
            placeholder="e.g., People Helped"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
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
              placeholder="e.g., BENEFICIARIES_REACHED"
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          )}
          <p className="mt-1 text-xs text-neutral-500">
            {availableMetrics.length > 0 ? 'Select a metric from your portfolio KPIs' : 'Metric codes are automatically converted to uppercase'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Calculation Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="sum">Sum over time</option>
              <option value="latest">Latest value only</option>
            </select>
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
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            People per Icon
          </label>
          <input
            type="number"
            value={perUnit}
            onChange={(e) => setPerUnit(e.target.value)}
            min="1"
            placeholder="10"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
          <p className="mt-1 text-xs text-neutral-500">How many people each icon represents</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Target (optional)
          </label>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g., 20000"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
          <p className="mt-1 text-xs text-neutral-500">Show progress toward this goal</p>
        </div>
      </div>

      <div className="bg-azure/10 border border-azure/20 rounded-2xl p-4">
        <div className="flex gap-3">
          <div className="text-sm text-ink">
            <p className="font-medium mb-1">Preview</p>
            <p>Each 👤 icon will represent {perUnit} people. The last icon can be partially filled to show exact progress.</p>
          </div>
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
          Create Widget
        </button>
      </div>
    </form>
  );
}
