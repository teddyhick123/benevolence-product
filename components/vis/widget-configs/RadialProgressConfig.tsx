'use client';

import * as React from 'react';

export type RadialProgressConfigProps = {
  initialConfig?: any;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
  portfolioId?: string;
  onPreviewChange?: (config: { title: string; config: any }) => void;
};

type KpiRing = {
  metric_code: string;
  target: string;
  label: string;
  unit: string;
  color: string;
};

const sunsetColors = ['#5186a6', '#e07a5f', '#f4a261'];

export default function RadialProgressConfig({ initialConfig, onSave, onCancel, portfolioId, onPreviewChange }: RadialProgressConfigProps) {
  const [title, setTitle] = React.useState(initialConfig?.title || '');
  const [rings, setRings] = React.useState<KpiRing[]>(() => {
    if (initialConfig?.config?.rings && Array.isArray(initialConfig.config.rings)) {
      return initialConfig.config.rings.map((r: any, i: number) => ({
        metric_code: r.metric_code || '',
        target: r.target?.toString() || '',
        label: r.label || '',
        unit: r.unit || '',
        color: r.color || sunsetColors[i % sunsetColors.length],
      }));
    }
    // Default: one ring
    return [{
      metric_code: '',
      target: '',
      label: '',
      unit: '',
      color: sunsetColors[0],
    }];
  });

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

  const addRing = () => {
    if (rings.length >= 3) return;
    setRings([...rings, {
      metric_code: '',
      target: '',
      label: '',
      unit: '',
      color: sunsetColors[rings.length % sunsetColors.length],
    }]);
  };

  const removeRing = (index: number) => {
    if (rings.length === 1) return;
    setRings(rings.filter((_, i) => i !== index));
  };

  const updateRing = (index: number, field: keyof KpiRing, value: string) => {
    const newRings = [...rings];
    newRings[index] = { ...newRings[index], [field]: value };
    setRings(newRings);
  };

  React.useEffect(() => {
    onPreviewChange?.({
      title: title || 'KPI Progress',
      config: {
        rings: rings.map(r => ({
          metric_code: r.metric_code,
          target: Number(r.target || 0),
          label: r.label || r.metric_code || 'KPI',
          unit: r.unit || undefined,
          color: r.color,
        }))
      }
    });
  }, [onPreviewChange, rings, title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that all rings have metric_code and target
    const isValid = rings.every(r => r.metric_code && r.target);
    if (!isValid) {
      alert('Please fill in metric code and target for all KPIs');
      return;
    }

    onSave({
      title: title || 'KPI Progress',
      config: {
        rings: rings.map(r => ({
          metric_code: r.metric_code,
          target: Number(r.target),
          label: r.label || r.metric_code,
          unit: r.unit || undefined,
          color: r.color,
        }))
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
            placeholder="e.g., Impact Progress"
            className="w-full px-4 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        <div className="border-t border-neutral-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-neutral-700">
              KPIs ({rings.length}/3)
            </label>
            {rings.length < 3 && (
              <button
                type="button"
                onClick={addRing}
                className="text-sm text-azure hover:text-azure-deep font-medium"
              >
                + Add KPI
              </button>
            )}
          </div>

          <div className="space-y-4">
            {rings.map((ring, index) => (
              <div key={index} className="p-4 border-2 border-neutral-200 rounded-2xl space-y-3 relative">
                {rings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRing(index)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                    aria-label="Remove KPI"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ring.color }}
                  />
                  <span className="text-sm font-semibold text-neutral-900">
                    KPI {index + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Metric Code <span className="text-red-500">*</span>
                    </label>
                    {availableMetrics.length > 0 ? (
                      <select
                        value={ring.metric_code}
                        onChange={(e) => updateRing(index, 'metric_code', e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
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
                        value={ring.metric_code}
                        onChange={(e) => updateRing(index, 'metric_code', e.target.value.toUpperCase())}
                        placeholder="e.g., CLIENTS_SERVED"
                        required
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Target <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={ring.target}
                      onChange={(e) => updateRing(index, 'target', e.target.value)}
                      placeholder="15000"
                      required
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={ring.unit}
                      onChange={(e) => updateRing(index, 'unit', e.target.value)}
                      placeholder="clients"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      value={ring.label}
                      onChange={(e) => updateRing(index, 'label', e.target.value)}
                      placeholder="Will use metric code if empty"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-700 mb-2">
                      Color
                    </label>
                    <div className="flex gap-2">
                      {sunsetColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateRing(index, 'color', color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            ring.color === color ? 'border-neutral-900 scale-110' : 'border-neutral-300'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
          {initialConfig ? 'Update Widget' : 'Create Widget'}
        </button>
      </div>
    </form>
  );
}
