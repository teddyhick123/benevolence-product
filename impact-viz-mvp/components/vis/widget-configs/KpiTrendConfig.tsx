'use client';

import * as React from 'react';

export type KpiTrendConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
};

export default function KpiTrendConfig({ initialConfig, onSave, onCancel }: KpiTrendConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [window, setWindow] = React.useState(initialConfig?.config?.period?.window || '12m');
  const [smooth, setSmooth] = React.useState(initialConfig?.config?.style?.smooth ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title || `${metricCode} Trend`,
      config: {
        metric_code: metricCode,
        period: { window },
        style: { smooth }
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
            placeholder="e.g., Renewable Energy Production"
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">Leave blank to auto-generate from metric</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Metric Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={metricCode}
            onChange={(e) => setMetricCode(e.target.value.toUpperCase())}
            placeholder="e.g., RENEWABLE_MWH"
            required
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">The metric code to track over time</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Time Window
          </label>
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
            <option value="24m">Last 2 years</option>
            <option value="all">All time</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="smooth"
            checked={smooth}
            onChange={(e) => setSmooth(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="smooth" className="text-sm text-neutral-700">
            Smooth line (interpolated curve)
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
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          Create Widget
        </button>
      </div>
    </form>
  );
}
