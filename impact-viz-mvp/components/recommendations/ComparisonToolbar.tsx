'use client';

type Props = {
  selectedCount: number;
  onCompare: () => void;
  onClear: () => void;
  maxSelections?: number;
};

export default function ComparisonToolbar({
  selectedCount,
  onCompare,
  onClear,
  maxSelections = 4,
}: Props) {
  const canCompare = selectedCount >= 2;
  const isAtMax = selectedCount >= maxSelections;

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="bg-white rounded-xl shadow-xl border-2 border-azure/20 px-6 py-4 flex items-center gap-4">
        {/* Selection Count */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-azure text-white flex items-center justify-center font-bold text-sm">
            {selectedCount}
          </div>
          <div className="text-sm">
            <div className="font-semibold text-neutral-900">
              {selectedCount} {selectedCount === 1 ? 'organization' : 'organizations'} selected
            </div>
            <div className="text-neutral-600 text-xs">
              {canCompare
                ? 'Ready to compare'
                : `Select ${2 - selectedCount} more to compare`}
              {isAtMax && ' (maximum reached)'}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-neutral-200" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            Clear Selection
          </button>
          <button
            onClick={onCompare}
            disabled={!canCompare}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all shadow-soft ${
              canCompare
                ? 'bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white hover:opacity-90'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Compare Organizations
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
