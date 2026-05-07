'use client';

import {
  ChartBarIcon,
  DocumentTextIcon,
  CalculatorIcon,
  ClipboardDocumentCheckIcon,
  UsersIcon,
  GlobeAltIcon,
  ArrowTrendingUpIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';

interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  isCore?: boolean;
}

interface ModuleCardProps {
  moduleId: string;
  module: ModuleDefinition;
  confidence?: number;
  reasoning?: string;
  isEnabled: boolean;
  onToggle: (moduleId: string, enabled: boolean) => void;
  isRecommended?: boolean;
  excludedReason?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'chart-bar': ChartBarIcon,
  'document-text': DocumentTextIcon,
  'calculator': CalculatorIcon,
  'clipboard-check': ClipboardDocumentCheckIcon,
  'users': UsersIcon,
  'globe': GlobeAltIcon,
  'trending-up': ArrowTrendingUpIcon,
  'folder': FolderIcon,
};

export default function ModuleCard({
  moduleId,
  module,
  confidence,
  reasoning,
  isEnabled,
  onToggle,
  isRecommended = true,
  excludedReason,
}: ModuleCardProps) {
  const Icon = ICON_MAP[module.icon || 'folder'] || FolderIcon;
  const confidencePercent = confidence ? Math.round(confidence * 100) : 0;

  return (
    <div
      className={`
        relative rounded-xl border-2 p-5 transition-all
        ${isEnabled
          ? 'border-azure bg-azure/5'
          : isRecommended
            ? 'border-neutral-200 bg-white'
            : 'border-dashed border-neutral-200 bg-neutral-50'
        }
      `}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(moduleId, !isEnabled)}
        className={`
          absolute top-4 right-4 w-12 h-7 rounded-full transition-colors
          ${isEnabled ? 'bg-azure' : 'bg-neutral-200'}
        `}
      >
        <span
          className={`
            block w-5 h-5 bg-white rounded-full shadow transition-transform
            ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>

      {/* Icon & Name */}
      <div className="flex items-start gap-4 mb-3 pr-14">
        <div
          className={`
            w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0
            ${isEnabled ? 'bg-azure text-white' : 'bg-neutral-100 text-neutral-500'}
          `}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${isEnabled ? 'text-azure' : 'text-neutral-900'}`}>
            {module.name}
          </h3>
          <p className="text-sm text-neutral-600">{module.description}</p>
        </div>
      </div>

      {/* Confidence bar (for recommended) */}
      {isRecommended && confidence !== undefined && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500">Match confidence</span>
            <span className={`text-xs font-medium ${confidencePercent >= 70 ? 'text-green-600' : 'text-neutral-600'}`}>
              {confidencePercent}%
            </span>
          </div>
          <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                confidencePercent >= 70 ? 'bg-green-500' : confidencePercent >= 50 ? 'bg-azure' : 'bg-neutral-400'
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Reasoning */}
      {reasoning && (
        <div className="text-sm text-neutral-600 bg-neutral-50 rounded-lg p-3 mt-3">
          <span className="font-medium text-neutral-700">Why: </span>
          {reasoning}
        </div>
      )}

      {/* Excluded reason */}
      {excludedReason && !isRecommended && (
        <div className="text-sm text-neutral-500 italic mt-3">
          {excludedReason}
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mt-3">
        {isRecommended && (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
            Recommended
          </span>
        )}
        {!isRecommended && isEnabled && (
          <span className="text-xs px-2 py-1 bg-azure/10 text-azure rounded-full">
            Added manually
          </span>
        )}
        {module.isCore && (
          <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-600 rounded-full">
            Core (always enabled)
          </span>
        )}
      </div>
    </div>
  );
}
