// lib/builder/proposal-state.ts
//
// Typed domain models and transition service for the Builder code_state
// machine (Builder Increment 2 durable data contract). Pure TypeScript +
// supabase-js calls: the client is always passed in by the caller, never
// constructed here, so this module is importable from both server routes
// and client components (mirrors lib/builder/review-gate.ts).

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// State model
// ============================================================

export const CODE_STATES = [
  'plan_ready', 'queued', 'generating', 'verifying', 'needs_repair',
  'ready_to_apply', 'pr_opened', 'merged', 'deployed', 'rejected', 'failed',
] as const;

export type CodeState = (typeof CODE_STATES)[number];

export const PROPOSAL_STATE_POLICY_VERSION = 'builder-state/v1';
export const REVIEW_POLICY_VERSION = 'builder-review-policy/v1';
export const REQUIRED_CHECK_KEYS: string[] = []; // Increment 3 populates under v2

export const CLAIMABLE_STATES: CodeState[] = ['plan_ready', 'needs_repair', 'failed'];
export const IN_FLIGHT_STATES: CodeState[] = ['queued', 'generating', 'verifying'];
export const TERMINAL_STATES: CodeState[] = ['deployed', 'rejected'];

const TRANSITIONS: Record<CodeState, CodeState[]> = {
  plan_ready: ['queued', 'rejected'],
  queued: ['generating', 'verifying', 'failed'],
  generating: ['verifying', 'failed'],
  verifying: ['needs_repair', 'ready_to_apply', 'failed', 'rejected'],
  needs_repair: ['queued', 'rejected'],
  ready_to_apply: ['pr_opened', 'queued', 'rejected'],
  pr_opened: ['merged', 'needs_repair', 'rejected'],
  merged: ['deployed'],
  deployed: [],
  rejected: [],
  failed: ['queued', 'rejected'],
};

export function canTransition(from: CodeState, to: CodeState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ProposalStateError extends Error {
  constructor(public from: CodeState, public to: CodeState) {
    super(`Invalid builder proposal transition: ${from} -> ${to}`);
    this.name = 'ProposalStateError';
  }
}

export function assertTransition(from: CodeState, to: CodeState): void {
  if (!canTransition(from, to)) {
    throw new ProposalStateError(from, to);
  }
}

export function isTerminalState(state: CodeState): boolean {
  return (TERMINAL_STATES as CodeState[]).includes(state);
}

const CODE_STATE_LABELS: Record<CodeState, string> = {
  plan_ready: 'Plan ready',
  queued: 'Queued',
  generating: 'Generating',
  verifying: 'Verifying',
  needs_repair: 'Needs repair',
  ready_to_apply: 'Ready to apply',
  pr_opened: 'PR opened',
  merged: 'Merged',
  deployed: 'Deployed',
  rejected: 'Rejected',
  failed: 'Failed',
};

const CODE_STATE_NEXT_STEPS: Record<CodeState, string> = {
  plan_ready: 'An organization admin can start the build to generate code.',
  queued: 'Waiting for the build worker to pick up the run.',
  generating: 'Builder is generating code for this proposal.',
  verifying: 'Automated review and verification checks are running.',
  needs_repair: 'Automated review found blocking issues; retry the build to repair them.',
  ready_to_apply: 'The build passed review; an organization admin can open a pull request.',
  pr_opened: 'Waiting for the pull request to be reviewed and merged.',
  merged: 'Waiting for the merged change to deploy.',
  deployed: 'This change has been deployed.',
  rejected: 'This proposal was rejected and will not proceed.',
  failed: 'The build run failed; retry to try again.',
};

export function codeStateLabel(state: CodeState): string {
  return CODE_STATE_LABELS[state];
}

export function codeStateNextStep(state: CodeState): string {
  return CODE_STATE_NEXT_STEPS[state];
}

// ============================================================
// Row types (durable data contract, migration 0025)
// ============================================================

export interface ProposalRow {
  id: string;
  org_id: string;
  proposal_type: 'config' | 'code';
  status: string | null;
  code_state: CodeState | null;
  current_revision_id: string | null;
  plan_content: unknown;
  rejected_reason: string | null;
}

export interface RevisionRow {
  id: string;
  proposal_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  kind: 'scaffold_generation' | 'generic_submission' | 'repair' | 'rebase';
  base_commit_sha: string | null;
  head_commit_sha: string | null;
  manifest_hash: string | null;
  diff_hash: string | null;
  context_hash: string | null;
  artifact_prefix: string;
  file_count: number | null;
  total_bytes: number | null;
  progress: unknown;
  created_at: string;
}

export interface ReviewAttemptRow {
  id: string;
  proposal_id: string;
  revision_id: string;
  attempt_number: number;
  trigger: 'initial' | 'retry' | 'repair' | 'rebase' | 'policy_change';
  status: 'running' | 'passed' | 'blocked' | 'failed';
  policy_version: string;
  required_check_keys: string[];
  summary_score: number | null;
  started_at: string;
  completed_at: string | null;
  decision_reason: string | null;
}

export interface FindingRow {
  id: string;
  review_attempt_id: string;
  reviewer_kind: string;
  severity: 'blocker' | 'error' | 'warning' | 'info';
  category: string | null;
  rule_id: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  evidence: string;
  recommendation: string | null;
  state: 'open' | 'resolved' | 'dismissed';
}

export interface VerificationRunRow {
  id: string;
  review_attempt_id: string;
  check_key: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';
  exit_code: number | null;
  duration_ms: number | null;
  log_artifact_key: string | null;
  evidence_hash: string | null;
  command_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DeliveryRecordRow {
  id: string;
  proposal_id: string;
  revision_id: string;
  provider: 'github' | 'vercel';
  pr_number: number | null;
  pr_url: string | null;
  branch_name: string | null;
  commit_sha: string | null;
  environment: string | null;
  status: string;
  created_at: string;
}

// ============================================================
// Transition service
// ============================================================

const PROPOSALS_TABLE = 'builder_proposals';

export type TransitionResult =
  | { ok: true; idempotent?: boolean }
  | { ok: false; currentState: CodeState | null };

/**
 * Atomically move a proposal from `from` to `to` via a compare-and-set
 * update scoped to (id, org_id, code_state = from). If the CAS matches no
 * row, re-reads the row to distinguish "someone else already made this
 * exact transition" (idempotent success) from "the row is in some other
 * state" (conflict) or "the row no longer exists" (currentState: null).
 */
export async function transitionProposal(
  admin: SupabaseClient,
  args: { proposalId: string; orgId: string; from: CodeState; to: CodeState; set?: Record<string, unknown> }
): Promise<TransitionResult> {
  const { proposalId, orgId, from, to, set } = args;

  const { data, error } = await admin
    .from(PROPOSALS_TABLE)
    .update({ code_state: to, ...set })
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .eq('code_state', from)
    .select('code_state')
    .maybeSingle();

  if (error) throw error;
  if (data) return { ok: true };

  // 0 rows matched: re-read to distinguish idempotent success from conflict.
  const { data: current, error: readError } = await admin
    .from(PROPOSALS_TABLE)
    .select('code_state')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (readError) throw readError;

  const currentState: CodeState | null = current?.code_state ?? null;
  if (currentState === to) return { ok: true, idempotent: true };
  return { ok: false, currentState };
}

/**
 * Fire-and-forget CAS: fails any run currently in an in-flight state
 * (queued/generating/verifying). A no-op (no error) when the proposal is
 * already in a different (e.g. terminal) state — Postgrest reports success
 * whether the CAS matched 0 or N rows.
 */
export async function failInFlightRun(admin: SupabaseClient, proposalId: string): Promise<void> {
  const { error } = await admin
    .from(PROPOSALS_TABLE)
    .update({ code_state: 'failed' })
    .eq('id', proposalId)
    .in('code_state', IN_FLIGHT_STATES);

  if (error) throw error;
}

// ============================================================
// Claim wrapper (RPC: builder_claim_code_run)
// ============================================================

export type ClaimResult =
  | { ok: true; revisionId: string; reused: boolean }
  | { ok: false; code: 'not_found' | 'conflict' | 'no_revision'; currentState?: string };

const CLAIM_CONFLICT_STATE_RE = /state\s+(\S+)\s*$/;

export async function claimCodeRun(
  admin: SupabaseClient,
  args: { proposalId: string; orgId: string; actorId: string }
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc('builder_claim_code_run', {
    p_proposal_id: args.proposalId,
    p_org_id: args.orgId,
    p_actor: args.actorId,
  });

  if (error) {
    if (error.code === 'P0032') return { ok: false, code: 'not_found' };
    if (error.code === 'P0033') {
      const match = typeof error.message === 'string' ? error.message.match(CLAIM_CONFLICT_STATE_RE) : null;
      return { ok: false, code: 'conflict', currentState: match?.[1] };
    }
    if (error.code === 'P0034') return { ok: false, code: 'no_revision' };
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('claimCodeRun: RPC returned no rows');
  return { ok: true, revisionId: row.revision_id, reused: row.reused };
}
