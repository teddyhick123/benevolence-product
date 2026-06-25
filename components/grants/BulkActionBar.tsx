'use client';

import { useState, useEffect } from 'react';
import { ALLOWED_TRANSITIONS, type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { grantStageLabel } from './grantPalette';
import { type GrantListItem } from './GrantPipelineView';

export interface QueuedTransitions {
  [stage: string]: LifecycleStage | null;
}

interface Props {
  grants: GrantListItem[];
  selectedIds: Set<string>;
  onApply: (queuedTransitions: QueuedTransitions) => void;
  onCancel: () => void;
}

export default function BulkActionBar({ grants, selectedIds, onApply, onCancel }: Props) {
  const [visible, setVisible] = useState(false);
  const [queued, setQueued] = useState<QueuedTransitions>({});

  // Spring-style entrance: mount invisible, then transition to visible
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Group selected grants by their current lifecycle stage
  const selectedGrants = grants.filter(g => selectedIds.has(g.id));
  const byStage = new Map<LifecycleStage, GrantListItem[]>();
  for (const g of selectedGrants) {
    const list = byStage.get(g.lifecycle_stage) ?? [];
    list.push(g);
    byStage.set(g.lifecycle_stage, list);
  }

  // Prune queued entries whose stage is no longer present in the selection
  // byStage is derived from selectedIds, so selectedIds is the correct dependency
  useEffect(() => {
    setQueued(prev => {
      const next = { ...prev };
      let changed = false;
      for (const stage of Object.keys(next)) {
        if (!byStage.has(stage as LifecycleStage)) {
          delete next[stage];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const hasAnyTarget = Object.values(queued).some(v => v !== null);

  function setTarget(stage: LifecycleStage, target: LifecycleStage | null) {
    setQueued(prev => ({ ...prev, [stage]: target }));
  }

  function handleApply() {
    const active: QueuedTransitions = {};
    for (const [stage, target] of Object.entries(queued)) {
      if (target) active[stage] = target as LifecycleStage;
    }
    onApply(active);
  }

  if (selectedIds.size === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
    >
      <div className="border-t border-black/10 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-ink">
              {selectedIds.size} grant{selectedIds.size !== 1 ? 's' : ''} selected — choose transitions below
            </span>
            <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
              Cancel
            </button>
          </div>

          {/* Per-stage rows */}
          <div className="space-y-2">
            {[...byStage.entries()].map(([stage, stageGrants]) => {
              const legalTargets = ALLOWED_TRANSITIONS[stage] ?? [];
              return (
                <div key={stage} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-neutral-600 w-48 shrink-0">
                    <span className="font-medium text-ink">{grantStageLabel(stage)}</span>
                    <span className="text-neutral-400 ml-1">({stageGrants.length})</span>
                  </span>
                  <svg className="w-4 h-4 text-neutral-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs text-neutral-400 mr-1">Transition to:</span>
                  <select
                    value={queued[stage] ?? ''}
                    onChange={e => setTarget(stage, (e.target.value as LifecycleStage) || null)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    <option value="">— select —</option>
                    {legalTargets.map(t => (
                      <option key={t} value={t}>{grantStageLabel(t)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleApply}
              disabled={!hasAnyTarget}
              className="inline-flex items-center gap-2 rounded-2xl bg-azure px-5 py-2 text-sm font-medium text-white shadow-soft transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Apply transitions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
