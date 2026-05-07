'use client';

import React from 'react';
import { DollarSign, TrendingUp, BarChart3 } from 'lucide-react';

export type SizingMode = 'funds_allocated' | 'total_contributions' | 'kpi';

export interface SizingControlProps {
  mode: SizingMode;
  onModeChange: (mode: SizingMode) => void;
  /** Available KPI metrics for selection when mode is 'kpi' */
  availableKpis?: Array<{
    code: string;
    name: string;
  }>;
  /** Selected KPI metric code (when mode is 'kpi') */
  selectedKpi?: string;
  /** Callback when KPI selection changes */
  onKpiChange?: (kpiCode: string) => void;
  disabled?: boolean;
}

const sizingModes: Array<{
  value: SizingMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'funds_allocated',
    label: 'Funds Allocated',
    description: 'Size by amount invested',
    icon: DollarSign,
  },
  {
    value: 'total_contributions',
    label: 'Total Contributions',
    description: 'Size by all contributions',
    icon: TrendingUp,
  },
  {
    value: 'kpi',
    label: 'KPI Value',
    description: 'Size by specific metric',
    icon: BarChart3,
  },
];

export default function SizingControl({
  mode,
  onModeChange,
  availableKpis = [],
  selectedKpi,
  onKpiChange,
  disabled = false,
}: SizingControlProps) {
  return (
    <div className="bg-white rounded-lg border border-black/10 shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-black/5">
        <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
          Size Points By
        </h3>
      </div>
      <div className="p-2">
        <div className="space-y-1">
          {sizingModes.map(({ value, label, description, icon: Icon }) => {
            const isActive = mode === value;
            const isKpiMode = value === 'kpi';

            return (
              <div key={value}>
                <button
                  type="button"
                  onClick={() => !disabled && onModeChange(value)}
                  disabled={disabled}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 rounded-md transition-all text-left
                    ${isActive
                      ? 'bg-azure text-white shadow-sm'
                      : 'text-neutral-700 hover:bg-neutral-50'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-neutral-900'}`}>
                      {label}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>
                      {description}
                    </div>
                  </div>
                  {isActive && (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </button>

                {/* KPI Selector (shown when KPI mode is active) */}
                {isKpiMode && isActive && availableKpis.length > 0 && (
                  <div className="mt-2 ml-9 mr-2">
                    <select
                      value={selectedKpi || ''}
                      onChange={(e) => onKpiChange?.(e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1.5 text-sm border border-black/10 rounded-md bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a metric...</option>
                      {availableKpis.map(kpi => (
                        <option key={kpi.code} value={kpi.code}>
                          {kpi.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Text */}
      <div className="px-3 py-2 bg-neutral-50 border-t border-black/5">
        <p className="text-xs text-neutral-600">
          {mode === 'funds_allocated' && 'Points sized by funds allocated to each holding'}
          {mode === 'total_contributions' && 'Points sized by cumulative contribution amounts'}
          {mode === 'kpi' && !selectedKpi && 'Select a metric to size points'}
          {mode === 'kpi' && selectedKpi && `Points sized by ${availableKpis.find(k => k.code === selectedKpi)?.name || 'selected metric'}`}
        </p>
      </div>
    </div>
  );
}
