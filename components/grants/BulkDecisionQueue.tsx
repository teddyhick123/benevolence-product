'use client';

import { useState } from 'react';
import { requiresDecision, type LifecycleStage, type DecisionPayload } from '@/lib/grants/lifecycle';
import { grantStageLabel } from './grantPalette';
import { type GrantListItem } from './GrantPipelineView';
import { type QueuedTransitions } from './BulkActionBar';

export interface BulkTransitionItem {
  grantId: string;
  grantName: string;
  fromStage: LifecycleStage;
  targetStage: LifecycleStage;
  amount: number | null;
  decision?: Partial<DecisionPayload>;
  skipped?: boolean;
}

interface Props {
  grants: GrantListItem[];
  queuedTransitions: QueuedTransitions;
  onConfirm: (items: BulkTransitionItem[]) => void;
  onCancel: () => void;
}

type DecisionType = DecisionPayload['decision_type'];
type DecisionValue = DecisionPayload['decision'];

const DECISION_TYPE_OPTIONS: DecisionType[] = ['approval', 'decline', 'defer', 'renewal', 'closeout', 'payment_release'];
const DECISION_VALUE_OPTIONS: DecisionValue[] = ['approved', 'declined', 'deferred', 'conditional', 'not_applicable'];

export default function BulkDecisionQueue({ grants, queuedTransitions, onConfirm, onCancel }: Props) {
  // Build all transitions that have a target stage chosen
  const allItems: BulkTransitionItem[] = [];
  for (const grant of grants) {
    const target = queuedTransitions[grant.lifecycle_stage] as LifecycleStage | undefined;
    if (!target) continue;
    allItems.push({
      grantId: grant.id,
      grantName: grant.holdings?.name ?? 'Unnamed Grant',
      fromStage: grant.lifecycle_stage,
      targetStage: target,
      amount: grant.approved_amount ?? grant.requested_amount,
    });
  }

  // Separate decision-required items from simple ones
  const decisionItems = allItems.filter(item => requiresDecision(item.fromStage, item.targetStage));
  const simpleItems = allItems.filter(item => !requiresDecision(item.fromStage, item.targetStage));

  const [step, setStep] = useState(0); // index into decisionItems; decisionItems.length = summary screen
  const [decisions, setDecisions] = useState<Record<string, Partial<DecisionPayload>>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in');

  const onSummary = step >= decisionItems.length;
  const current = decisionItems[step];

  function advance(dir: 'forward' | 'back') {
    setSlideDir(dir === 'forward' ? 'out' : 'in');
    setTimeout(() => {
      setStep(s => s + (dir === 'forward' ? 1 : -1));
      setSlideDir('in');
    }, 150);
  }

  function saveDecision(grantId: string, partial: Partial<DecisionPayload>) {
    setDecisions(prev => ({ ...prev, [grantId]: { ...prev[grantId], ...partial } }));
  }

  function skipCurrent() {
    setSkipped(prev => new Set([...prev, current.grantId]));
    advance('forward');
  }

  function nextStep() {
    advance('forward');
  }

  function confirm() {
    const result: BulkTransitionItem[] = [
      ...simpleItems,
      ...decisionItems
        .filter(item => !skipped.has(item.grantId))
        .map(item => ({ ...item, decision: decisions[item.grantId] })),
    ];
    onConfirm(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Progress bar */}
        {decisionItems.length > 0 && (
          <div className="h-1 bg-neutral-100">
            <div
              className="h-1 bg-azure transition-all duration-300"
              style={{ width: `${Math.round((step / (decisionItems.length)) * 100)}%` }}
            />
          </div>
        )}

        <div className="p-6">
          {/* Summary screen */}
          {onSummary ? (
            <div>
              <h2 className="text-lg font-semibold text-ink mb-4">Ready to apply</h2>
              <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                {simpleItems.map(item => (
                  <div key={item.grantId} className="flex items-center justify-between text-sm py-1 border-b border-black/5">
                    <span className="text-neutral-700 truncate mr-4">{item.grantName}</span>
                    <span className="text-neutral-400 shrink-0">{grantStageLabel(item.fromStage)} → {grantStageLabel(item.targetStage)}</span>
                  </div>
                ))}
                {decisionItems
                  .filter(item => !skipped.has(item.grantId))
                  .map(item => (
                    <div key={item.grantId} className="flex items-center justify-between text-sm py-1 border-b border-black/5">
                      <span className="text-neutral-700 truncate mr-4">{item.grantName}</span>
                      <span className="text-neutral-400 shrink-0">{grantStageLabel(item.fromStage)} → {grantStageLabel(item.targetStage)}</span>
                    </div>
                  ))}
                {skipped.size > 0 && (
                  <p className="text-xs text-neutral-400 pt-2">{skipped.size} grant{skipped.size !== 1 ? 's' : ''} skipped</p>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={onCancel} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirm}
                  className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
                >
                  Confirm &amp; apply
                </button>
              </div>
            </div>
          ) : (
            /* Decision step */
            <div
              className="transition-all duration-150"
              style={{ opacity: slideDir === 'out' ? 0 : 1, transform: slideDir === 'out' ? 'translateX(-20px)' : 'translateX(0)' }}
            >
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-400 font-medium">
                  Decision {step + 1} of {decisionItems.length}
                </span>
                <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
                  Cancel all
                </button>
              </div>

              <h2 className="text-base font-semibold text-ink mb-0.5">{current.grantName}</h2>
              <p className="text-sm text-neutral-500 mb-5">
                {grantStageLabel(current.fromStage)} → {grantStageLabel(current.targetStage)}
              </p>

              {/* Decision form */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Decision type</label>
                    <select
                      value={decisions[current.grantId]?.decision_type ?? ''}
                      onChange={e => saveDecision(current.grantId, { decision_type: e.target.value as DecisionType || undefined })}
                      className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    >
                      <option value="">Select…</option>
                      {DECISION_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Decision</label>
                    <select
                      value={decisions[current.grantId]?.decision ?? ''}
                      onChange={e => saveDecision(current.grantId, { decision: e.target.value as DecisionValue || undefined })}
                      className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    >
                      <option value="">Select…</option>
                      {DECISION_VALUE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Amount</label>
                  <input
                    type="number"
                    value={decisions[current.grantId]?.amount ?? current.amount ?? ''}
                    onChange={e => saveDecision(current.grantId, { amount: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                    placeholder="Amount"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Board meeting date <span className="text-neutral-300">(optional)</span></label>
                  <input
                    type="date"
                    value={decisions[current.grantId]?.board_meeting_date ?? ''}
                    onChange={e => saveDecision(current.grantId, { board_meeting_date: e.target.value || undefined })}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Rationale <span className="text-neutral-300">(optional)</span></label>
                  <textarea
                    value={decisions[current.grantId]?.rationale ?? ''}
                    onChange={e => saveDecision(current.grantId, { rationale: e.target.value || undefined })}
                    rows={2}
                    className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                    placeholder="Reason for decision…"
                  />
                </div>
              </div>

              {/* Navigation */}
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={skipCurrent}
                  className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Skip this grant
                </button>
                <button
                  onClick={nextStep}
                  className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
                >
                  {step + 1 < decisionItems.length ? 'Next →' : 'Review →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
