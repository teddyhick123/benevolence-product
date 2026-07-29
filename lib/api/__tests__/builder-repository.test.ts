// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppAdminBuilderRepository,
  createOrgBuilderRepository,
} from '@/lib/api/repositories/builder';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockTransitionProposal,
  mockEnqueueScaffoldBuildJob,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockTransitionProposal: vi.fn(),
  mockEnqueueScaffoldBuildJob: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/builder/proposal-state', () => ({
  transitionProposal: mockTransitionProposal,
  claimCodeRun: vi.fn(),
  failInFlightRun: vi.fn(),
  IN_FLIGHT_STATES: ['queued', 'generating', 'verifying'],
}));

vi.mock('@/lib/builder/scaffold-worker', () => ({
  enqueueScaffoldBuildJob: mockEnqueueScaffoldBuildJob,
}));

vi.mock('@/lib/builder/github-apply', () => ({
  isGitHubConfigured: vi.fn(() => false),
  getDefaultBranchSha: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
  mockTransitionProposal.mockResolvedValue({ ok: true, currentState: 'rejected' });
});

describe('createAppAdminBuilderRepository', () => {
  it('requires an app-admin principal before constructing elevated access', () => {
    expect(() => createAppAdminBuilderRepository({
      isAppAdmin: false as true,
      actorId: 'user-1',
    })).toThrow('App admin access required');
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('applies the requested status filter when listing global review proposals', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createAppAdminBuilderRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    }).listProposals('pending');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
  });

  it('loads a code proposal by ID and delegates rejection to the canonical transition service', async () => {
    const query = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'proposal-1',
            org_id: 'org-1',
            proposal_type: 'code',
            code_state: 'ready_to_apply',
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(query);

    const result = await createAppAdminBuilderRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    }).reviewProposal({
      proposalId: 'proposal-1',
      status: 'rejected',
      reviewerNotes: 'Unsafe change',
    });

    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'proposal-1'] });
    expect(mockTransitionProposal).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      expect.objectContaining({
        proposalId: 'proposal-1',
        orgId: 'org-1',
        from: 'ready_to_apply',
        to: 'rejected',
        set: expect.objectContaining({ reviewed_by: 'admin-1' }),
      })
    );
    expect(result).toEqual({
      ok: true,
      proposal: { id: 'proposal-1', code_state: 'rejected', org_id: 'org-1' },
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createAppAdminBuilderRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});

describe('createOrgBuilderRepository', () => {
  it('requires both proposal ID and authorized org before acting on a build', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { code_state: 'generating' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    const result = await createOrgBuilderRepository({
      orgId: 'org-1',
      actorId: 'reviewer-1',
    }).startBuild('proposal-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'proposal-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(result).toEqual({ ok: true, proposalId: 'proposal-1', alreadyRunning: true });
  });
});
