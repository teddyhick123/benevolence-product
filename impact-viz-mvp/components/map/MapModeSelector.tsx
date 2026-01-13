'use client';

import React from 'react';
import { Map, Flame } from 'lucide-react';

export type MapMode = 'points' | 'heatmap';

interface MapModeSelectorProps {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  disabled?: boolean;
}

const modes: Array<{
  value: MapMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: 'points',
    label: 'Points',
    icon: Map,
    description: 'Individual holdings as points',
  },
  {
    value: 'heatmap',
    label: 'Heat Map',
    icon: Flame,
    description: 'Density visualization',
  },
];

export default function MapModeSelector({
  mode,
  onModeChange,
  disabled = false,
}: MapModeSelectorProps) {
  return (
    <div className="bg-white rounded-lg border border-black/10 shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-black/5">
        <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
          Visualization Mode
        </h3>
      </div>
      <div className="p-2">
        <div className="flex flex-col gap-1">
          {modes.map(({ value, label, icon: Icon, description }) => {
            const isActive = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => !disabled && onModeChange(value)}
                disabled={disabled}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md transition-all
                  ${isActive
                    ? 'bg-azure text-white shadow-sm'
                    : 'text-neutral-700 hover:bg-neutral-50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                title={description}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                <div className="flex-1 text-left">
                  <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-neutral-900'}`}>
                    {label}
                  </div>
                  <div className={`text-xs ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>
                    {description}
                  </div>
                </div>
                {isActive && (
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20">
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
