import { describe, expect, it } from 'vitest';
import { getProposalLifecycle, PROPOSAL_LIFECYCLE_STATUSES, proposalLifecycleNextStep } from '@/lib/builder/proposal-lifecycle';

describe('Builder proposal lifecycle', () => {
  it('maps the implementation review path with honest gate states', () => {
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'plan_ready' })).toBe('needs_implementation_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'queued' })).toBe('in_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'reviewing' })).toBe('in_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'needs_repair' })).toBe('needs_repair');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'ready_to_apply' })).toBe('ready_to_apply');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'failed' })).toBe('run_failed');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'approved', phase: 'pr_opened', prUrl: 'https://example.com/pr/1' })).toBe('pr_opened');
  });

  it('never reports a delivery state — shipped is retired', () => {
    expect(PROPOSAL_LIFECYCLE_STATUSES).not.toContain('shipped');
    // A stray legacy row with phase=shipped still has an open-PR truth.
    expect(getProposalLifecycle({ proposalType: 'code', status: 'applied', phase: 'shipped', prUrl: 'https://example.com/pr/1' })).toBe('pr_opened');
  });

  it('keeps safe configuration changes separate from implementation proposals', () => {
    expect(getProposalLifecycle({ proposalType: 'config', status: 'pending' })).toBe('awaiting_approval');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'applied' })).toBe('applied');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'rejected' })).toBe('rejected');
  });

  it('has next-step copy for every status and never promises deployment from an open PR', () => {
    for (const status of PROPOSAL_LIFECYCLE_STATUSES) {
      expect(proposalLifecycleNextStep(status).length).toBeGreaterThan(0);
    }
    expect(proposalLifecycleNextStep('pr_opened').toLowerCase()).not.toContain('shipped');
  });
});
