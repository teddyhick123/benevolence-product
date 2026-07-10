import { describe, expect, it } from 'vitest';
import { getProposalLifecycle } from '@/lib/builder/proposal-lifecycle';

describe('Builder proposal lifecycle', () => {
  it('maps the implementation review path without confusing a PR with a shipped change', () => {
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'plan_ready' })).toBe('needs_implementation_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'reviewing' })).toBe('in_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'approved', phase: 'pr_opened', prUrl: 'https://example.com/pr/1' })).toBe('pr_opened');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'applied', phase: 'shipped', prUrl: 'https://example.com/pr/1' })).toBe('shipped');
  });

  it('keeps safe configuration changes separate from implementation proposals', () => {
    expect(getProposalLifecycle({ proposalType: 'config', status: 'pending' })).toBe('awaiting_approval');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'applied' })).toBe('applied');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'rejected' })).toBe('rejected');
  });
});
