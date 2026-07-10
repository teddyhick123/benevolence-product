export const PROPOSAL_LIFECYCLE_STATUSES = [
  'drafted',
  'awaiting_approval',
  'applied',
  'needs_implementation_review',
  'in_review',
  'pr_opened',
  'shipped',
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
  if (input.phase === 'shipped') return 'shipped';
  if (input.phase === 'pr_opened' || input.prUrl) return 'pr_opened';
  if (input.proposalType === 'config') {
    if (input.status === 'applied') return 'applied';
    return 'awaiting_approval';
  }
  if (input.phase === 'plan_ready') return 'needs_implementation_review';
  if (['building', 'build_ready', 'reviewing', 'ready_to_apply', 'implementation_review'].includes(input.phase || '')) {
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
    needs_implementation_review: 'An implementation reviewer must start the code review process.',
    in_review: 'Implementation is being generated or reviewed before a PR can open.',
    pr_opened: 'A pull request is open. Mark it shipped once the change is deployed.',
    shipped: 'This change is live for the foundation.',
    rejected: 'This request was declined. Builder can help draft an alternative.',
  };
  return steps[status];
}
