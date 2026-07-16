'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, ChevronDown, ChevronRight, ExternalLink, GitPullRequest } from 'lucide-react';
import type { CodeState, FindingRow } from '@/lib/builder/proposal-state';

export interface ReviewReportAttempt {
  status: string;
  policy_version: string;
  summary_score: number | null;
  decision_reason: string | null;
}

interface ReviewReportCardProps {
  attempt: ReviewReportAttempt | null;
  findings: FindingRow[];
  codeState: CodeState;
  prUrl: string | null;
  proposalId: string;
  orgId: string;
  githubEnabled: boolean;
  canReviewImplementation?: boolean;
}

const SEVERITY_ORDER: Record<FindingRow['severity'], number> = { blocker: 0, error: 1, warning: 2, info: 3 };
const SEVERITY_LABEL: Record<FindingRow['severity'], string> = { blocker: 'Blocker', error: 'Error', warning: 'Warning', info: 'Info' };
const SEVERITY_TEXT_CLASS: Record<FindingRow['severity'], string> = {
  blocker: 'text-red-700',
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-slate-600',
};

function SeverityIcon({ severity }: { severity: FindingRow['severity'] }) {
  if (severity === 'blocker' || severity === 'error') return <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />;
  if (severity === 'warning') return <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />;
  return <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />;
}

export default function ReviewReportCard({
  attempt,
  findings,
  codeState,
  prUrl: initialPrUrl,
  proposalId,
  orgId,
  githubEnabled,
  canReviewImplementation = false,
}: ReviewReportCardProps) {
  // Blockers/errors first — severity is always shown as text, not by color alone.
  const openFindings = findings
    .filter(f => f.state === 'open')
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const hasIssues = openFindings.some(f => f.severity === 'blocker' || f.severity === 'error')
    || attempt?.status === 'blocked' || attempt?.status === 'failed';
  const [expanded, setExpanded] = useState(hasIssues);
  const [applying, setApplying] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(initialPrUrl);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleOpenPR() {
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(
        `/api/org/${orgId}/builder/proposals/${proposalId}/apply`,
        { method: 'POST' }
      );
      const data = await res.json() as { prUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Apply failed');
      setPrUrl(data.prUrl ?? null);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm max-w-[90%]">
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">Review Report</span>
          {attempt?.summary_score != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium text-slate-700 bg-white border-slate-200">
              Summary score {attempt.summary_score} (non-authoritative)
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 space-y-2 mt-2">
          {attempt?.decision_reason && (
            <p className="text-xs text-slate-600">{attempt.decision_reason}</p>
          )}

          {openFindings.map((f) => (
            <div key={f.id} className={`flex gap-2 text-xs ${SEVERITY_TEXT_CLASS[f.severity]}`}>
              <SeverityIcon severity={f.severity} />
              <span>
                <span className="font-semibold uppercase mr-1">{SEVERITY_LABEL[f.severity]}</span>
                {f.evidence}
                {f.recommendation ? <span className="block text-slate-500 mt-0.5">{f.recommendation}</span> : null}
              </span>
            </div>
          ))}
          {openFindings.length === 0 && (
            <p className="text-xs text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              No open issues found.
            </p>
          )}
          <a
            href="/builder-studio"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
          >
            Track proposal in Builder Studio <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-xs text-slate-400 italic">
            Diff shown against an empty base until sandbox verification ships (Increment 3).
          </p>

          {githubEnabled && (
            <div className="mt-3 flex flex-col gap-1.5">
              {codeState === 'ready_to_apply' && !prUrl && canReviewImplementation && (
                <button
                  onClick={handleOpenPR}
                  disabled={applying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-azure text-white text-xs font-medium hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                  {applying ? 'Opening PR…' : 'Open PR'}
                </button>
              )}
              {codeState === 'ready_to_apply' && !prUrl && !canReviewImplementation && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  An implementation reviewer is required to open a PR for this proposal.
                </p>
              )}
              {prUrl && (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                  View PR on GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {applyError && (
                <p className="text-xs text-red-600">{applyError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
