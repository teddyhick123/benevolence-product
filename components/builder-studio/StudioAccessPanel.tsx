'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

interface StudioAccessPanelProps {
  orgId: string;
}

interface ReviewerRow {
  membership_id: string;
  user_id: string;
  role: 'admin' | 'owner';
  email: string | null;
  full_name: string | null;
  implementation_reviewer: boolean;
}

interface ReviewersResponse {
  reviewers?: ReviewerRow[];
  canManage?: boolean;
  error?: string;
}

function displayName(row: ReviewerRow) {
  return row.full_name || row.email || `${row.user_id.slice(0, 8)}...`;
}

export default function StudioAccessPanel({ orgId }: StudioAccessPanelProps) {
  const [reviewers, setReviewers] = useState<ReviewerRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReviewers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/capabilities/implementation-reviewers`, { cache: 'no-store' });
      const data = await res.json() as ReviewersResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to load access');
      setReviewers(data.reviewers || []);
      setCanManage(data.canManage === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviewers();
  }, [orgId]);

  async function setReviewer(row: ReviewerRow, enabled: boolean) {
    setSavingUserId(row.user_id);
    setError(null);
    try {
      const res = await fetch(
        enabled
          ? `/api/org/${orgId}/capabilities/implementation-reviewers?user_id=${encodeURIComponent(row.user_id)}`
          : `/api/org/${orgId}/capabilities/implementation-reviewers`,
        {
          method: enabled ? 'DELETE' : 'POST',
          headers: enabled ? undefined : { 'Content-Type': 'application/json' },
          body: enabled ? undefined : JSON.stringify({ user_id: row.user_id }),
        }
      );
      const data = await res.json() as ReviewersResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to update access');
      setReviewers(data.reviewers || []);
      setCanManage(data.canManage === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update access');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section id="access" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <ShieldCheck className="h-4 w-4 text-azure" />
            Studio Access
          </div>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Implementation reviewers can advance code-level Builder proposals, including generated builds and PRs.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${canManage ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
          {canManage ? 'Owner controls' : 'Read only'}
        </span>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading access
        </div>
      ) : reviewers.length === 0 ? (
        <div className="mt-4 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">
          No admins or owners are available for implementation review.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-neutral-100">
          {reviewers.map((row) => (
            <div key={row.user_id} className="flex min-h-16 items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-neutral-900">{displayName(row)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs capitalize text-neutral-600">
                    {row.role}
                  </span>
                  {row.email ? <span className="truncate text-xs text-neutral-400">{row.email}</span> : null}
                </div>
              </div>
              <button
                role="switch"
                aria-checked={row.implementation_reviewer}
                aria-label={`${row.implementation_reviewer ? 'Revoke' : 'Grant'} implementation reviewer for ${displayName(row)}`}
                onClick={() => setReviewer(row, row.implementation_reviewer)}
                disabled={!canManage || savingUserId === row.user_id}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-azure focus:ring-offset-1 ${
                  row.implementation_reviewer ? 'bg-azure' : 'bg-neutral-300'
                } ${(!canManage || savingUserId === row.user_id) ? 'opacity-50' : ''}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${
                    row.implementation_reviewer ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
