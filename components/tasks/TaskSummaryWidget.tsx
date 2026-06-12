'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  overdue:    number;
  due_soon:   number;
  blocked:    number;
  mine:       number;
  total_open: number;
}

interface Props {
  orgId: string;
}

const TILES = [
  { key: 'overdue'  as const, label: 'Overdue',  tab: 'overdue',  accent: 'text-red-600',    bg: 'bg-red-50',    },
  { key: 'due_soon' as const, label: 'Due Soon', tab: 'due_soon', accent: 'text-amber-600',  bg: 'bg-amber-50',  },
  { key: 'blocked'  as const, label: 'Blocked',  tab: 'open',     accent: 'text-neutral-600', bg: 'bg-neutral-50',},
  { key: 'mine'     as const, label: 'My Tasks', tab: 'mine',     accent: 'text-azure',       bg: 'bg-azure/5',   },
] as const;

export default function TaskSummaryWidget({ orgId }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    fetch(`/api/org/${orgId}/tasks/summary`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setSummary(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  if (!orgId) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="animate-pulse rounded-2xl bg-neutral-100 h-20" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const hasAny = summary.total_open > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-700">Tasks</h2>
        <Link
          href={`/org/${orgId}/tasks`}
          className="text-xs text-azure hover:underline"
        >
          View all {summary.total_open > 0 ? `(${summary.total_open} open)` : ''}
        </Link>
      </div>
      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 py-4 text-center text-sm text-neutral-400">
          No open tasks
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TILES.map(tile => {
            const count = summary[tile.key];
            return (
              <Link
                key={tile.key}
                href={`/org/${orgId}/tasks?tab=${tile.tab}`}
                className={`flex flex-col items-center justify-center rounded-2xl border border-black/5 ${tile.bg} p-3 hover:shadow-md transition-shadow`}
              >
                <span className={`text-2xl font-bold tabular-nums ${tile.accent}`}>
                  {count}
                </span>
                <span className="mt-1 text-xs text-neutral-500 font-medium">{tile.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
