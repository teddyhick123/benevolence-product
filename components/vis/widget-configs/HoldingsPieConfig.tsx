'use client';

import * as React from 'react';

export type HoldingsPieConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
};

export default function HoldingsPieConfig({ initialConfig, onSave, onCancel }: HoldingsPieConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || 'Portfolio Allocation');
  const [showLegend, setShowLegend] = React.useState(initialConfig?.config?.showLegend ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title,
      config: {
        size: 320,
        innerRadius: 48,
        showLegend,
        legendMaxHeight: 240,
        nameField: 'name',
        valueFieldPrimary: 'funds_allocated',
        valueFieldFallback: 'nav'
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
            placeholder="e.g., Portfolio Allocation"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="showLegend"
            checked={showLegend}
            onChange={(e) => setShowLegend(e.target.checked)}
            className="w-4 h-4 text-azure border-neutral-300 rounded focus:ring-azure/30"
          />
          <label htmlFor="showLegend" className="text-sm text-neutral-700">
            Show legend with holding names
          </label>
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
        <h4 className="text-sm font-medium text-neutral-900 mb-2">Auto-Configuration</h4>
        <p className="text-sm text-neutral-600">
          This widget automatically fetches your holdings and creates a pie chart showing allocation by funds allocated (or NAV as fallback).
        </p>
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
