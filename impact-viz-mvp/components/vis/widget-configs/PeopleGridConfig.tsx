'use client';

import * as React from 'react';

export type PeopleGridConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
};

export default function PeopleGridConfig({ initialConfig, onSave, onCancel }: PeopleGridConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || 'People Helped');
  const [metricCode, setMetricCode] = React.useState(initialConfig?.config?.metric_code || '');
  const [mode, setMode] = React.useState(initialConfig?.config?.mode || 'sum');
  const [window, setWindow] = React.useState(initialConfig?.config?.window || '12m');
  const [perUnit, setPerUnit] = React.useState(initialConfig?.config?.perUnit || 10);
  const [target, setTarget] = React.useState(initialConfig?.config?.target || '');

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
          <p className="mt-1 text-xs text-neutral-500">The metric representing people helped</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Calculation Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">Show progress toward this goal</p>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-2xl">💡</div>
          <div className="text-sm text-indigo-900">
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
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          Create Widget
        </button>
      </div>
    </form>
  );
}
