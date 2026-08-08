'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ScaffoldPlanContent } from '@/lib/builder/tools';

interface PlanCardProps {
  orgId: string;
  proposalId: string;
  planContent: ScaffoldPlanContent;
  canReviewImplementation?: boolean;
  onApproved: () => void;
}

export default function PlanCard({ orgId, proposalId, planContent, canReviewImplementation = false, onApproved }: PlanCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await apiRequest(
        `/api/org/${orgId}/builder/proposals/${proposalId}/build`,
        { method: 'POST' }
      );
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Failed to start build');
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-sm max-w-[90%]">
      <button
        className="w-full flex items-center justify-between px-4 py-3 font-medium"
        onClick={() => setExpanded(e => !e)}
      >
        <span>Module Plan: {planContent.moduleName}</span>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-blue-200">
          <div className="mt-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Tables</p>
            {planContent.tables.map(t => (
              <div key={t.name} className="text-xs text-blue-800 mb-1">
                <span className="font-mono font-medium">{t.name}</span>
                {' '}— {t.columns.filter(c => c.name !== 'id' && c.name !== 'organization_id' && !c.name.endsWith('_at')).map(c => c.name).join(', ')}
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Files</p>
            <ul className="space-y-0.5">
              {planContent.files.map(f => (
                <li key={f.path} className="text-xs font-mono text-blue-700 truncate">
                  {f.path}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {canReviewImplementation ? (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="mt-2 flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {approving ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting build…
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Start Implementation Review
                </>
              )}
            </button>
          ) : (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This plan needs an implementation reviewer before code generation can start.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
