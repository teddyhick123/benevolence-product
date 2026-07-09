'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';

type ChecklistStage = {
  items: Array<{
    key: string;
    label: string;
    required: boolean;
    sort_order: number;
    completed: boolean;
    completed_by: string | null;
    completed_at: string | null;
  }>;
  approval_requirement: { required: boolean; description: string } | null;
};

interface Props {
  orgId: string;
  grantId: string;
  currentStage: LifecycleStage;
}

export default function StageChecklist({ orgId, grantId, currentStage }: Props) {
  const [data, setData] = useState<Record<string, ChecklistStage>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/org/${orgId}/grants/${grantId}/checklist`)
      .then(async res => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Failed to load checklist');
        return json.data ?? {};
      })
      .then(nextData => {
        if (!cancelled) setData(nextData);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Failed to load checklist');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, grantId]);

  const stage = data[currentStage];
  const items = useMemo(() => stage?.items ?? [], [stage]);

  async function toggleItem(itemKey: string, completed: boolean) {
    const previous = data;
    setPendingKey(itemKey);
    setError(null);
    setData(current => ({
      ...current,
      [currentStage]: {
        ...current[currentStage],
        items: (current[currentStage]?.items ?? []).map(item =>
          item.key === itemKey ? { ...item, completed } : item
        ),
      },
    }));

    try {
      const res = await fetch(`/api/org/${orgId}/grants/${grantId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_key: currentStage, item_key: itemKey, completed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to update checklist');
    } catch (err: any) {
      setData(previous);
      setError(err?.message ?? 'Failed to update checklist');
    } finally {
      setPendingKey(null);
    }
  }

  if (loading || (!stage?.approval_requirement && items.length === 0)) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      {items.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Stage Checklist</h3>
          <div className="space-y-2">
            {items.map(item => (
              <label key={item.key} className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={pendingKey === item.key}
                  onChange={e => toggleItem(item.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-azure focus:ring-azure/30"
                />
                <span className="flex-1">
                  <span className={item.completed ? 'text-gray-400 line-through' : ''}>{item.label}</span>
                  {item.required && !item.completed && (
                    <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-red-500 align-middle" aria-label="Required" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {stage?.approval_requirement && (
        <div className={items.length > 0 ? 'mt-4 border-t border-gray-100 pt-3' : ''}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Approval Note</p>
          <p className="mt-1 text-sm text-gray-600">
            {stage.approval_requirement.description || 'Approval is noted for this stage.'}
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
