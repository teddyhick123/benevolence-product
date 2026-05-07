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
  category: 'metrics' | 'performance' | 'impact' | 'charts' | 'custom';
};

const WIDGET_TYPES: WidgetType[] = [
  // Metrics & KPIs
  {
    id: 'kpi_trend',
    name: 'KPI Trend Line',
    description: 'Track a metric over time with a line chart',
    icon: (
      <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    category: 'metrics'
  },
  {
    id: 'radial_progress',
    name: 'Radial Progress',
    description: 'Beautiful circular progress indicator',
    icon: (
      <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'metrics'
  },
  {
    id: 'people_grid_auto',
    name: 'People Helped',
    description: 'Visualize impact with people icons',
    icon: (
      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    category: 'metrics'
  },

  // Performance & Comparison
  {
    id: 'small_multiples',
    name: 'Small Multiples',
    description: 'Compare one metric across all holdings with sparklines',
    icon: (
      <svg className="w-8 h-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
      </svg>
    ),
    category: 'performance'
  },
  {
    id: 'performance_heat_map',
    name: 'Performance Heat Map',
    description: 'Color-coded grid showing metrics over time or by holding',
    icon: (
      <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 9h16M4 13h16M4 17h16" />
      </svg>
    ),
    category: 'performance'
  },
  {
    id: 'holdings_comparison_table',
    name: 'Comparison Table',
    description: 'Sortable table comparing multiple metrics across holdings',
    icon: (
      <svg className="w-8 h-8 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    category: 'performance'
  },

  // Impact & Timeline
  {
    id: 'impact_timeline',
    name: 'Impact Timeline',
    description: 'Visualize milestones and achievements over time',
    icon: (
      <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'impact'
  },
  {
    id: 'waterfall_chart',
    name: 'Waterfall Chart',
    description: 'Show how funds flow or impact accumulates',
    icon: (
      <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    category: 'impact'
  },
  {
    id: 'impact_bubble_chart',
    name: 'Bubble Chart',
    description: 'Multi-dimensional view with size, color, and position',
    icon: (
      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12a5 5 0 1110 0 5 5 0 01-10 0zm12-5a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    category: 'impact'
  },

  // Charts & Breakdowns
  {
    id: 'holdings_pie_auto',
    name: 'Holdings Breakdown',
    description: 'Pie chart of portfolio allocation',
    icon: (
      <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    ),
    category: 'charts'
  },
  {
    id: 'emissions_bar',
    name: 'Emissions Comparison',
    description: 'Compare emissions across scopes',
    icon: (
      <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    category: 'charts'
  },

  // Custom
  {
    id: 'd3_json',
    name: 'Custom Visualization',
    description: 'Upload your own D3 chart',
    icon: (
      <svg className="w-8 h-8 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    category: 'custom'
  }
];

export default function CreateWidgetModal({ portfolioId, holdingId, open, onClose, onCreated, editing }: CreateWidgetModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [step, setStep] = React.useState<'select' | 'configure'>('select');
  const [selectedType, setSelectedType] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);

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

  // Focus management
  React.useEffect(() => {
    if (!mounted) return;
    if (open) {
      triggerRef.current = document.activeElement;
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open, mounted]);

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

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
      ref={dialogRef}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-widget-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 id="create-widget-title" className="text-xl font-semibold text-neutral-900">
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
    { id: 'performance', label: 'Performance & Comparison', description: 'Compare metrics across holdings' },
    { id: 'impact', label: 'Impact & Timeline', description: 'Visualize milestones and achievements' },
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
                  <div className="mb-3">{widget.icon}</div>
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
  const SmallMultiplesConfig = React.lazy(() => import('./widget-configs/SmallMultiplesConfig'));
  const PerformanceHeatMapConfig = React.lazy(() => import('./widget-configs/PerformanceHeatMapConfig'));
  const HoldingsComparisonTableConfig = React.lazy(() => import('./widget-configs/HoldingsComparisonTableConfig'));
  const ImpactTimelineConfig = React.lazy(() => import('./widget-configs/ImpactTimelineConfig'));
  const WaterfallChartConfig = React.lazy(() => import('./widget-configs/WaterfallChartConfig'));
  const ImpactBubbleChartConfig = React.lazy(() => import('./widget-configs/ImpactBubbleChartConfig'));

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
      case 'small_multiples':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <SmallMultiplesConfig {...props} />
          </React.Suspense>
        );
      case 'performance_heat_map':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <PerformanceHeatMapConfig {...props} />
          </React.Suspense>
        );
      case 'holdings_comparison_table':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <HoldingsComparisonTableConfig {...props} />
          </React.Suspense>
        );
      case 'impact_timeline':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <ImpactTimelineConfig {...props} />
          </React.Suspense>
        );
      case 'waterfall_chart':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <WaterfallChartConfig {...props} />
          </React.Suspense>
        );
      case 'impact_bubble_chart':
        return (
          <React.Suspense fallback={<div>Loading...</div>}>
            <ImpactBubbleChartConfig {...props} />
          </React.Suspense>
        );
      case 'emissions_bar':
      case 'd3_json':
        return (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8 text-center">
            <p className="text-neutral-600 mb-4">
              Advanced configuration for <strong>{type}</strong> coming soon.
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              Contact support if you need help setting up this widget type.
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
