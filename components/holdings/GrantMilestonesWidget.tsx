'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect } from 'react';

type Milestone = {
  id: string;
  milestone_name: string;
  description?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  notes?: string | null;
};

const STATUS_STYLES: Record<Milestone['status'], string> = {
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  pending: 'bg-neutral-100 text-neutral-600',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-neutral-100 text-neutral-400 line-through',
};

function fmt(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  portfolioId: string;
  holdingId: string;
}

export default function GrantMilestonesWidget({ portfolioId, holdingId }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest(`/api/portfolio/${encodeURIComponent(portfolioId)}/holdings/${encodeURIComponent(holdingId)}/milestones`)
      .then(r => r.ok ? readJson(r) : { data: [] })
      .then(d => setMilestones(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId, holdingId]);

  if (loading) return null;
  if (milestones.length === 0) return null;

  const done = milestones.filter(m => m.status === 'completed').length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-800">Grant Milestones</h3>
        <span className="text-xs text-neutral-500">{done}/{milestones.length} completed</span>
      </div>
      <div className="space-y-2">
        {milestones.map(m => (
          <div key={m.id} className="flex items-start gap-3">
            <div className="mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center
              {m.status === 'completed' ? 'border-green-500 bg-green-500' : 'border-neutral-300'}">
              {m.status === 'completed' && (
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium ${m.status === 'cancelled' ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                  {m.milestone_name}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_STYLES[m.status]}`}>
                  {m.status.replace('_', ' ')}
                </span>
              </div>
              {m.due_date && (
                <p className="text-xs text-neutral-500 mt-0.5">
                  Due {fmt(m.due_date)}{m.completed_date ? ` · Completed ${fmt(m.completed_date)}` : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
