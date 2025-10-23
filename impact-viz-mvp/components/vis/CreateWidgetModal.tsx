'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export type CreateWidgetModalProps = {
  portfolioId: string;
  holdingId?: string;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  editing?: { id: string; type: string; title: string | null; config: any } | null;
};

type WidgetType = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'metrics' | 'charts' | 'custom';
};

const WIDGET_TYPES: WidgetType[] = [
  {
    id: 'kpi_trend',
    name: 'KPI Trend Line',
    description: 'Track a metric over time with a line chart',
    icon: '📈',
    category: 'metrics'
  },
  {
    id: 'radial_progress',
    name: 'Radial Progress',
    description: 'Beautiful circular progress indicator with sunset colors',
    icon: '🎯',
    category: 'metrics'
  },
  {
    id: 'people_grid_auto',
    name: 'People Helped',
    description: 'Visualize impact with people icons',
    icon: '👥',
    category: 'metrics'
  },
  {
    id: 'holdings_pie_auto',
    name: 'Holdings Breakdown',
    description: 'Pie chart of portfolio allocation',
    icon: '🥧',
    category: 'charts'
  },
  {
    id: 'emissions_bar',
    name: 'Emissions Comparison',
    description: 'Compare emissions across scopes',
    icon: '📊',
    category: 'charts'
  },
  {
    id: 'd3_json',
    name: 'Custom Visualization',
    description: 'Upload your own D3 chart',
    icon: '⚡',
    category: 'custom'
  }
];

export default function CreateWidgetModal({ portfolioId, holdingId, open, onClose, onCreated, editing }: CreateWidgetModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [step, setStep] = React.useState<'select' | 'configure'>('select');
  const [selectedType, setSelectedType] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      if (editing) {
        // If editing, skip to configure step
        setSelectedType(editing.type);
        setStep('configure');
      } else {
        // If creating, start at select step
        setStep('select');
        setSelectedType(null);
      }
    }
  }, [open, editing]);

  const handleSelectType = (typeId: string) => {
    setSelectedType(typeId);
    setStep('configure');
  };

  const handleBack = () => {
    setStep('select');
    setSelectedType(null);
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">
              {editing ? 'Edit Widget' : step === 'select' ? 'Add Visualization' : 'Configure Widget'}
            </h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              {editing ? WIDGET_TYPES.find(t => t.id === editing.type)?.name : step === 'select' ? 'Choose a widget type to get started' : WIDGET_TYPES.find(t => t.id === selectedType)?.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {step === 'select' ? (
            <SelectWidgetType onSelect={handleSelectType} />
          ) : selectedType ? (
            <ConfigureWidget
              type={selectedType}
              portfolioId={portfolioId}
              holdingId={holdingId}
              editing={editing}
              onBack={handleBack}
              onSave={() => {
                onCreated?.();
                onClose();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SelectWidgetType({ onSelect }: { onSelect: (typeId: string) => void }) {
  const categories = [
    { id: 'metrics', label: 'Metrics & KPIs', description: 'Track performance and goals' },
    { id: 'charts', label: 'Charts & Breakdowns', description: 'Visualize data distributions' },
    { id: 'custom', label: 'Custom', description: 'Advanced visualizations' }
  ];

  return (
    <div className="p-6 space-y-8">
      {categories.map(category => {
        const widgets = WIDGET_TYPES.filter(w => w.category === category.id);
        if (widgets.length === 0) return null;

        return (
          <div key={category.id}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">{category.label}</h3>
              <p className="text-sm text-neutral-600">{category.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {widgets.map(widget => (
                <button
                  key={widget.id}
                  onClick={() => onSelect(widget.id)}
                  className="group relative flex flex-col items-start p-5 rounded-2xl border-2 border-neutral-200 bg-white hover:border-indigo-500 hover:shadow-lg transition-all text-left"
                >
                  <div className="text-4xl mb-3">{widget.icon}</div>
                  <h4 className="text-base font-semibold text-neutral-900 mb-1">{widget.name}</h4>
                  <p className="text-sm text-neutral-600 leading-relaxed">{widget.description}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfigureWidget({
  type,
  portfolioId,
  holdingId,
  editing,
  onBack,
  onSave
}: {
  type: string;
  portfolioId: string;
  holdingId?: string;
  editing?: { id: string; type: string; title: string | null; config: any } | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const apiEndpoint = holdingId
    ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
    : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

  const handleSaveConfig = async ({ title, config }: { title: string; config: any }) => {
    setIsLoading(true);
    setError(null);

    try {
      if (editing) {
        // Update existing widget
        const updateEndpoint = holdingId
          ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets/${encodeURIComponent(editing.id)}`
          : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(editing.id)}`;

        const response = await fetch(updateEndpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, title, config })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update widget');
        }
      } else {
        // Create new widget
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, title, config })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to create widget');
        }
      }

      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save widget');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      {!editing && (
        <div className="mb-6">
          <button
            onClick={onBack}
            disabled={isLoading}
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to widget types
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-neutral-600">Creating widget...</p>
        </div>
      ) : (
        <WidgetConfigForm
          type={type}
          portfolioId={portfolioId}
          editing={editing}
          onSave={handleSaveConfig}
          onCancel={onBack}
        />
      )}
    </div>
  );
}

function WidgetConfigForm({
  type,
  portfolioId,
  editing,
  onSave,
  onCancel
}: {
  type: string;
  portfolioId: string;
  editing?: { id: string; type: string; title: string | null; config: any } | null;
  onSave: (config: { title: string; config: any }) => void;
  onCancel: () => void;
}) {
  // Import config components dynamically
  const KpiTrendConfig = React.lazy(() => import('./widget-configs/KpiTrendConfig'));
  const RadialProgressConfig = React.lazy(() => import('./widget-configs/RadialProgressConfig'));
  const PeopleGridConfig = React.lazy(() => import('./widget-configs/PeopleGridConfig'));
  const HoldingsPieConfig = React.lazy(() => import('./widget-configs/HoldingsPieConfig'));

  const renderConfig = () => {
    const initialConfig = editing ? { title: editing.title, config: editing.config } : undefined;
    const props = { onSave, onCancel, portfolioId, initialConfig };

    switch (type) {
      case 'kpi_trend':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <KpiTrendConfig {...props} />
          </React.Suspense>
        );
      case 'radial_progress':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <RadialProgressConfig {...props} />
          </React.Suspense>
        );
      case 'people_grid_auto':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <PeopleGridConfig {...props} />
          </React.Suspense>
        );
      case 'holdings_pie_auto':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <HoldingsPieConfig {...props} />
          </React.Suspense>
        );
      case 'radial_progress_rings':
      case 'emissions_bar':
      case 'd3_json':
      case 'holdings_pie':
      case 'people_grid':
        return (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8 text-center">
            <p className="text-neutral-600 mb-4">
              Advanced configuration for <strong>{type}</strong> coming soon.
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              For now, you can edit this widget using the JSON editor in the main widgets panel.
            </p>
            <button
              onClick={onCancel}
              className="px-6 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors"
            >
              {editing ? 'Close' : 'Go Back'}
            </button>
          </div>
        );
      default:
        return (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <p className="text-red-700">Unknown widget type: {type}</p>
          </div>
        );
    }
  };

  return renderConfig();
}
