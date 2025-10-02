'use client';

import * as React from 'react';

export type TargetGaugeConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
};

export default function TargetGaugeConfig({ initialConfig, onSave, onCancel }: TargetGaugeConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [target, setTarget] = React.useState(initialConfig?.config?.target || '');
  const [unit, setUnit] = React.useState(initialConfig?.config?.unit || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title || `${metricCode} Progress`,
      config: {
        metric_code: metricCode,
        target: Number(target),
        unit: unit || undefined,
        bands: [
          { upto: 0.4, color: '#fee2e2' },
          { upto: 0.75, color: '#fef3c7' },
          { upto: 1.0, color: '#dcfce7' }
        ]
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
            placeholder="e.g., Clients Served Progress"
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Metric Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={metricCode}
            onChange={(e) => setMetricCode(e.target.value.toUpperCase())}
            placeholder="e.g., CLIENTS_SERVED"
            required
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">The metric to track progress for</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Target Goal <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g., 15000"
            required
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">The goal you're working toward</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Unit (optional)
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., clients, tCO2, MWh"
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">Display label for the metric</p>
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-neutral-900 mb-2">Color Bands</h4>
        <div className="space-y-2 text-sm text-neutral-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
            <span>0-40%: Needs attention</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200"></div>
            <span>40-75%: Making progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
            <span>75-100%: On track</span>
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
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          Create Widget
        </button>
      </div>
    </form>
  );
}
