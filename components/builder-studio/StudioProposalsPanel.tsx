'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Clock3, FileCode2, GitPullRequest, Loader2, Send, UserRound } from 'lucide-react';
import { CLAIMABLE_STATES, codeStateLabel, codeStateNextStep, type CodeState, type FindingRow } from '@/lib/builder/proposal-state';

interface StudioProposalsPanelProps {
  orgId: string;
  canReviewImplementation: boolean;
}

interface ConfigSummary {
  status: string;
  config_patch: Record<string, unknown> | null;
  reviewer_notes: string | null;
}

interface RevisionSummary {
  id: string;
  revision_number: number;
  kind: string;
  base_commit_sha: string | null;
  file_count: number | null;
  total_bytes: number | null;
  created_at: string;
}

interface LatestAttemptSummary {
  status: string;
  policy_version: string;
  blocker_count: number;
  warning_count: number;
  summary_score: number | null;
  completed_at: string | null;
}

interface CodeSummary {
  code_state: CodeState;
  rejected_reason: string | null;
  revision: RevisionSummary | null;
  latest_attempt: LatestAttemptSummary | null;
  checks: { required: number; passed: number; failed: number; pending: number };
  delivery: { status: string; pr_url: string | null; pr_number: number | null } | null;
}

interface Proposal {
  id: string;
  request_text: string;
  requested_by_name: string | null;
  proposal_type: 'config' | 'code';
  created_at: string;
  config: ConfigSummary | null;
  code: CodeSummary | null;
}

interface ProposalDetail {
  attempts: Array<{ findings: FindingRow[] }>;
  error?: string;
}

const CODE_STATE_CLASS: Record<CodeState, string> = {
  plan_ready: 'border-blue-200 bg-blue-50 text-blue-700',
  queued: 'border-violet-200 bg-violet-50 text-violet-700',
  generating: 'border-violet-200 bg-violet-50 text-violet-700',
  verifying: 'border-violet-200 bg-violet-50 text-violet-700',
  needs_repair: 'border-orange-200 bg-orange-50 text-orange-800',
  ready_to_apply: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pr_opened: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  merged: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  deployed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

const CONFIG_STATUS_CLASS: Record<string, string> = {
  pending: 'border-blue-200 bg-blue-50 text-blue-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  applied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};
const DEFAULT_CONFIG_CLASS = 'border-neutral-200 bg-neutral-50 text-neutral-700';

const CONFIG_STATUS_NEXT_STEP: Record<string, string> = {
  pending: 'An organization admin can approve this safe configuration change.',
  approved: 'This configuration change is approved and will be applied.',
  applied: 'The configuration has been applied to this workspace.',
  rejected: 'This request was declined.',
};

const SEVERITY_ORDER: Record<FindingRow['severity'], number> = { blocker: 0, error: 1, warning: 2, info: 3 };

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  const [findingsById, setFindingsById] = useState<Record<string, FindingRow[]>>({});
  const [findingsLoadingId, setFindingsLoadingId] = useState<string | null>(null);

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

  // Findings live behind the detail fetch: the list endpoint only returns
  // aggregate blocker/warning counts (no evidence bodies), so expanding a
  // code proposal lazily loads the latest attempt's findings on demand.
  async function toggleExpanded(proposal: Proposal) {
    const next = expandedId === proposal.id ? null : proposal.id;
    setExpandedId(next);
    if (next && proposal.proposal_type === 'code' && !findingsById[proposal.id]) {
      setFindingsLoadingId(proposal.id);
      try {
        const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposal.id}`, { cache: 'no-store' });
        const data = await res.json() as ProposalDetail;
        if (res.ok) {
          setFindingsById(prev => ({ ...prev, [proposal.id]: data.attempts?.[0]?.findings ?? [] }));
        }
      } catch {
        /* leave findings unset; the evidence line still shows aggregate counts */
      } finally {
        setFindingsLoadingId(null);
      }
    }
  }

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
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Review every Builder request with its owner, state, next step, and evidence from the latest verification run.</p>
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
          const expanded = expandedId === proposal.id;
          const code = proposal.code;
          const config = proposal.config;
          const badgeClass = code ? CODE_STATE_CLASS[code.code_state] : (CONFIG_STATUS_CLASS[config?.status ?? ''] ?? DEFAULT_CONFIG_CLASS);
          const badgeLabel = code ? codeStateLabel(code.code_state) : titleCase(config?.status ?? 'unknown');
          const nextStep = code ? codeStateNextStep(code.code_state) : (config ? (CONFIG_STATUS_NEXT_STEP[config.status] ?? '') : '');
          const configEntries = Object.entries(config?.config_patch || {});
          const revision = code?.revision ?? null;
          const sha8 = revision?.base_commit_sha ? revision.base_commit_sha.slice(0, 8) : null;
          const fileCount = revision?.file_count ?? 0;
          const blockerCount = code?.latest_attempt?.blocker_count ?? 0;
          const findings = (findingsById[proposal.id] ?? [])
            .filter(f => f.state === 'open')
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
          const prUrl = code?.delivery?.pr_url ?? null;
          const claimable = code ? CLAIMABLE_STATES.includes(code.code_state) : false;

          return <div key={proposal.id} className="py-4">
            <button onClick={() => toggleExpanded(proposal)} className="flex w-full items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>{badgeLabel}</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">{proposal.proposal_type === 'code' ? 'Implementation' : 'Configuration'}</span>
                  <span className="flex items-center gap-1 text-xs text-neutral-400"><Clock3 className="h-3.5 w-3.5" />{formatDate(proposal.created_at)}</span>
                </div>
                <div className="mt-1 truncate text-sm font-medium text-neutral-900">{proposal.request_text}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500"><UserRound className="h-3.5 w-3.5" />{proposal.requested_by_name || 'Foundation admin'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">{code && fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : null}{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
            </button>

            {expanded ? <div className="mt-3 space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs text-neutral-600">{nextStep}</div>

              {code ? <div className="text-xs text-neutral-500">
                Revision {revision?.revision_number ?? '—'} · base {sha8 ?? 'uncaptured'} · {fileCount} file{fileCount === 1 ? '' : 's'} · {blockerCount} blocker{blockerCount === 1 ? '' : 's'} · checks {code.checks.passed}/{code.checks.required}
              </div> : null}

              {configEntries.length ? <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Configuration preview</div>
                <div className="mt-2 space-y-1">
                  {configEntries.map(([key, value]) => <div key={key} className="grid grid-cols-[7rem_1fr] gap-2 rounded bg-white px-2 py-1 text-xs"><span className="font-medium text-neutral-600">{key}</span><span className="font-mono text-neutral-700">{previewValue(value)}</span></div>)}
                </div>
              </div> : null}

              {code ? <div className="space-y-1.5">
                {findingsLoadingId === proposal.id ? <div className="flex items-center gap-1.5 text-xs text-neutral-500"><Loader2 className="h-3 w-3 animate-spin" />Loading findings…</div> : null}
                {findingsLoadingId !== proposal.id && findings.length ? findings.slice(0, 5).map((finding) => <div key={finding.id} className={`rounded px-2 py-1 text-xs ${finding.severity === 'blocker' || finding.severity === 'error' ? 'bg-red-50 text-red-800' : finding.severity === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-white text-neutral-600'}`}><span className="font-semibold uppercase">{finding.severity}</span> {finding.evidence}</div>) : null}
              </div> : null}

              {prUrl ? <a href={prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-azure hover:underline"><GitPullRequest className="h-3.5 w-3.5" />Open pull request</a> : null}
              {code?.code_state === 'plan_ready' && canReviewImplementation ? <button onClick={() => startImplementationReview(proposal.id)} disabled={startingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />{startingId === proposal.id ? 'Starting...' : 'Start build'}</button> : null}
              {code && (code.code_state === 'needs_repair' || code.code_state === 'failed') && canReviewImplementation ? <button onClick={() => startImplementationReview(proposal.id)} disabled={startingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />{startingId === proposal.id ? 'Starting...' : 'Retry build'}</button> : null}
              {code?.code_state === 'ready_to_apply' && !prUrl && canReviewImplementation ? <button onClick={() => openPullRequest(proposal.id)} disabled={openingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><GitPullRequest className="h-3.5 w-3.5" />{openingId === proposal.id ? 'Opening...' : 'Open pull request'}</button> : null}
              {code && claimable && !canReviewImplementation ? <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"><Send className="h-3.5 w-3.5" />An implementation reviewer is required to advance this request.</div> : null}
            </div> : null}
          </div>;
        })}
      </div>
    </section>
  );
}
