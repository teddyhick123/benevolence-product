export const PROPOSAL_LIFECYCLE_STATUSES = [
  'drafted',
  'awaiting_approval',
  'applied',
  'needs_implementation_review',
  'in_review',
  'needs_repair',
  'ready_to_apply',
  'run_failed',
  'pr_opened',
  'rejected',
] as const;

export type ProposalLifecycleStatus = typeof PROPOSAL_LIFECYCLE_STATUSES[number];

export interface ProposalLifecycleInput {
  proposalType: 'config' | 'code';
  status: string;
  phase?: string | null;
  prUrl?: string | null;
}

export function getProposalLifecycle(input: ProposalLifecycleInput): ProposalLifecycleStatus {
  if (input.status === 'rejected') return 'rejected';
  // `shipped` is retired: an open PR is the last state Builder can attest to
  // until verified merge/deployment records exist (audit Phase 6).
  if (input.phase === 'pr_opened' || input.phase === 'shipped' || input.prUrl) return 'pr_opened';
  if (input.proposalType === 'config') {
    if (input.status === 'applied') return 'applied';
    return 'awaiting_approval';
  }
  if (input.phase === 'plan_ready') return 'needs_implementation_review';
  if (input.phase === 'needs_repair') return 'needs_repair';
  if (input.phase === 'ready_to_apply') return 'ready_to_apply';
  if (input.phase === 'failed') return 'run_failed';
  if (['queued', 'building', 'build_ready', 'reviewing', 'implementation_review'].includes(input.phase || '')) {
    return 'in_review';
  }
  return 'drafted';
}

export function proposalLifecycleLabel(status: ProposalLifecycleStatus): string {
  return status.replace(/_/g, ' ');
}

export function proposalLifecycleNextStep(status: ProposalLifecycleStatus): string {
  const steps: Record<ProposalLifecycleStatus, string> = {
    drafted: 'Builder is preparing the change request.',
    awaiting_approval: 'An organization admin can approve this safe configuration change.',
    applied: 'The configuration has been applied to this workspace.',
    needs_implementation_review: 'An implementation reviewer must start the automated build and review run.',
    in_review: 'Implementation is being generated and reviewed before a PR can open.',
    needs_repair: 'Automated review found blocking issues. A reviewer can retry the run or decline the proposal.',
    ready_to_apply: 'Automated review passed. An implementation reviewer can open a pull request.',
    run_failed: 'The last run failed before producing a review. A reviewer can retry the run.',
    pr_opened: 'A pull request is open. Merge and deployment happen through the normal engineering release process.',
    rejected: 'This request was declined. Builder can help draft an alternative.',
  };
  return steps[status];
}
