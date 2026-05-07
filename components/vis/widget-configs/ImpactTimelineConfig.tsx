'use client';

import * as React from 'react';

export type ImpactTimelineConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
};

const EVENT_TYPES = [
  { value: 'milestone', label: 'Milestones', description: 'Key achievements and goals' },
  { value: 'achievement', label: 'Achievements', description: 'Significant accomplishments' },
  { value: 'funding', label: 'Funding', description: 'Funding rounds and contributions' },
  { value: 'metric', label: 'Metric Milestones', description: 'Notable metric achievements' },
  { value: 'other', label: 'Other', description: 'General events' }
];

export default function ImpactTimelineConfig({ initialConfig, onSave, onCancel }: ImpactTimelineConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [window, setWindow] = React.useState(initialConfig?.config?.window || '12m');
  const [orientation, setOrientation] = React.useState<'horizontal' | 'vertical'>(initialConfig?.config?.orientation || 'horizontal');
  const [showHoldingNames, setShowHoldingNames] = React.useState(initialConfig?.config?.showHoldingNames ?? true);
  const [filterTypes, setFilterTypes] = React.useState<string[]>(
    initialConfig?.config?.filterTypes || ['milestone', 'achievement', 'funding', 'metric', 'other']
  );
  const [minEvents, setMinEvents] = React.useState(initialConfig?.config?.minEvents || 3);

  const handleEventTypeToggle = (eventType: string) => {
    setFilterTypes(prev => {
      if (prev.includes(eventType)) {
        return prev.filter(t => t !== eventType);
      } else {
        return [...prev, eventType];
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title || 'Impact Timeline',
      config: {
        window,
        orientation,
        showHoldingNames,
        filterTypes,
        minEvents
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
            placeholder="e.g., Impact Timeline"
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
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

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Layout Style
          </label>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as 'horizontal' | 'vertical')}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="horizontal">Horizontal (D3 Timeline)</option>
            <option value="vertical">Vertical (Card List)</option>
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            {orientation === 'horizontal' ? 'Visual D3 timeline with date axis' : 'Chronological list of event cards'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Event Types to Show
          </label>
          <div className="border border-neutral-300 rounded-lg p-3 space-y-2">
            {EVENT_TYPES.map(eventType => (
              <label key={eventType.value} className="flex items-start gap-3 cursor-pointer hover:bg-neutral-50 p-2 rounded">
                <input
                  type="checkbox"
                  checked={filterTypes.includes(eventType.value)}
                  onChange={() => handleEventTypeToggle(eventType.value)}
                  className="w-4 h-4 mt-0.5 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-neutral-700">{eventType.label}</div>
                  <div className="text-xs text-neutral-500">{eventType.description}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Select at least one event type</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="showHoldingNames"
            checked={showHoldingNames}
            onChange={(e) => setShowHoldingNames(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="showHoldingNames" className="text-sm text-neutral-700">
            Show holding names on events
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Minimum Events
          </label>
          <input
            type="number"
            value={minEvents}
            onChange={(e) => setMinEvents(Number(e.target.value))}
            min={1}
            max={10}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-neutral-500">Minimum events required to display widget</p>
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
          disabled={filterTypes.length === 0}
          className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-lg hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
