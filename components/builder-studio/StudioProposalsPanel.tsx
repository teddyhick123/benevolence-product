'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Clock3, FileCode2, GitPullRequest, Loader2, Send, UserRound } from 'lucide-react';
import {
  getProposalLifecycle,
  proposalLifecycleLabel,
  proposalLifecycleNextStep,
  type ProposalLifecycleStatus,
} from '@/lib/builder/proposal-lifecycle';

interface StudioProposalsPanelProps {
  orgId: string;
  canReviewImplementation: boolean;
}

interface Proposal {
  id: string;
  request_text: string;
  requested_by_name: string | null;
  proposal_type: 'config' | 'code';
  status: string;
  phase: string | null;
  generated_code: { files?: Array<{ path: string }> } | null;
  config_patch: Record<string, unknown> | null;
  plan_content: { moduleName?: string; files?: Array<{ path: string; description?: string }> } | null;
  review_report: { score?: number; findings?: Array<{ severity: string; description: string }> } | null;
  pr_url: string | null;
  created_at: string;
}

const STATUS_CLASS: Record<ProposalLifecycleStatus, string> = {
  drafted: 'border-neutral-200 bg-neutral-50 text-neutral-700',
  awaiting_approval: 'border-blue-200 bg-blue-50 text-blue-700',
  applied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_implementation_review: 'border-amber-200 bg-amber-50 text-amber-800',
  in_review: 'border-violet-200 bg-violet-50 text-violet-700',
  needs_repair: 'border-orange-200 bg-orange-50 text-orange-800',
  ready_to_apply: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  run_failed: 'border-red-200 bg-red-50 text-red-700',
  pr_opened: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function previewValue(value: unknown) {
  const serialized = JSON.stringify(value);
  return serialized && serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
}

export default function StudioProposalsPanel({ orgId, canReviewImplementation }: StudioProposalsPanelProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/builder/proposals`, { cache: 'no-store' });
      const data = await res.json() as { proposals?: Proposal[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load proposals');
      setProposals(data.proposals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void loadProposals(); }, [loadProposals]);

  async function startImplementationReview(proposalId: string) {
    setStartingId(proposalId);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposalId}/build`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to start implementation review');
      await loadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start implementation review');
    } finally {
      setStartingId(null);
    }
  }

  async function openPullRequest(proposalId: string) {
    setOpeningId(proposalId);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposalId}/apply`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to open pull request');
      await loadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open pull request');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section id="proposals" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800"><FileCode2 className="h-4 w-4 text-azure" />Implementation Review</div>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Review every Builder request with its owner, lifecycle, next step, and a structured preview of the proposed change.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${canReviewImplementation ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
          {canReviewImplementation ? 'Reviewer enabled' : 'Status and previews'}
        </span>
      </div>

      {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {loading ? <div className="mt-4 flex items-center gap-2 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Loading proposals</div> : null}
      {!loading && proposals.length === 0 ? <div className="mt-4 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">No Builder proposals yet.</div> : null}

      <div className="mt-4 divide-y divide-neutral-100">
        {proposals.slice(0, 8).map((proposal) => {
          const lifecycle = getProposalLifecycle({ proposalType: proposal.proposal_type, status: proposal.status, phase: proposal.phase, prUrl: proposal.pr_url });
          const expanded = expandedId === proposal.id;
          const fileCount = proposal.generated_code?.files?.length || proposal.plan_content?.files?.length || 0;
          const files = proposal.generated_code?.files || proposal.plan_content?.files || [];
          const configEntries = Object.entries(proposal.config_patch || {});

          return <div key={proposal.id} className="py-4">
            <button onClick={() => setExpandedId(expanded ? null : proposal.id)} className="flex w-full items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[lifecycle]}`}>{proposalLifecycleLabel(lifecycle)}</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">{proposal.proposal_type === 'code' ? 'Implementation' : 'Configuration'}</span>
                  <span className="flex items-center gap-1 text-xs text-neutral-400"><Clock3 className="h-3.5 w-3.5" />{formatDate(proposal.created_at)}</span>
                </div>
                <div className="mt-1 truncate text-sm font-medium text-neutral-900">{proposal.request_text}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500"><UserRound className="h-3.5 w-3.5" />{proposal.requested_by_name || 'Foundation admin'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">{fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : null}{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
            </button>

            {expanded ? <div className="mt-3 space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs text-neutral-600">{proposalLifecycleNextStep(lifecycle)}</div>

              {files.length ? <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Implementation preview</div>
                <div className="mt-2 space-y-1">
                  {files.map((file) => <div key={file.path} className="rounded bg-white px-2 py-1 font-mono text-xs text-neutral-700">{file.path}</div>)}
                </div>
              </div> : null}

              {configEntries.length ? <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Configuration preview</div>
                <div className="mt-2 space-y-1">
                  {configEntries.map(([key, value]) => <div key={key} className="grid grid-cols-[7rem_1fr] gap-2 rounded bg-white px-2 py-1 text-xs"><span className="font-medium text-neutral-600">{key}</span><span className="font-mono text-neutral-700">{previewValue(value)}</span></div>)}
                </div>
              </div> : null}

              {proposal.review_report ? <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white px-2 py-1 text-neutral-700">Review score: {proposal.review_report.score ?? 'pending'}</span><span className="text-neutral-500">{proposal.review_report.findings?.length || 0} finding{proposal.review_report.findings?.length === 1 ? '' : 's'}</span></div>
                {(proposal.review_report.findings || []).slice(0, 5).map((finding, index) => <div key={index} className={`rounded px-2 py-1 text-xs ${finding.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-white text-neutral-600'}`}><span className="font-semibold uppercase">{finding.severity}</span> {finding.description}</div>)}
              </div> : null}

              {proposal.pr_url ? <a href={proposal.pr_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-azure hover:underline"><GitPullRequest className="h-3.5 w-3.5" />Open pull request</a> : null}
              {lifecycle === 'needs_implementation_review' && canReviewImplementation ? <button onClick={() => startImplementationReview(proposal.id)} disabled={startingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />{startingId === proposal.id ? 'Starting...' : 'Start implementation review'}</button> : null}
              {(lifecycle === 'needs_repair' || lifecycle === 'run_failed') && canReviewImplementation ? <button onClick={() => startImplementationReview(proposal.id)} disabled={startingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />{startingId === proposal.id ? 'Starting...' : 'Retry review run'}</button> : null}
              {lifecycle === 'ready_to_apply' && !proposal.pr_url && canReviewImplementation ? <button onClick={() => openPullRequest(proposal.id)} disabled={openingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><GitPullRequest className="h-3.5 w-3.5" />{openingId === proposal.id ? 'Opening...' : 'Open pull request'}</button> : null}
              {lifecycle === 'needs_implementation_review' && !canReviewImplementation ? <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"><Send className="h-3.5 w-3.5" />An implementation reviewer is required to advance this request.</div> : null}
            </div> : null}
          </div>;
        })}
      </div>
    </section>
  );
}
