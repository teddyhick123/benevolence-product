// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGrantRepository } from '@/lib/api/repositories/grants';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom, rpc: mockRpc });
});

describe('createGrantRepository', () => {
  it('forces portfolio lookups into the repository org scope', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'portfolio-1', org_id: 'org-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findPortfolio('portfolio-1');

    expect(mockFrom).toHaveBeenCalledWith('portfolios');
    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'portfolio-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
  });

  it('only resolves active accepted owner assignments in the scoped org', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'membership-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findOrganizationMember('owner-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'owner-1'] });
    expect(query.calls).toContainEqual({ method: 'not', args: ['accepted_at', 'is', null] });
  });

  it('injects org and actor scope into atomic grant creation', async () => {
    mockRpc.mockResolvedValue({ data: { grant: { id: 'grant-1' } }, error: null });
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.createWithFoundationRecords({
      portfolioId: 'portfolio-1',
      purpose: 'Education',
      requestedAmount: 100_000,
      investeeId: 'investee-1',
      currency: 'USD',
      lifecycleStage: 'draft',
      renewalEligible: false,
    });

    expect(mockRpc).toHaveBeenCalledWith('create_grant_with_foundation_records', {
      p_org_id: 'org-1',
      p_portfolio_id: 'portfolio-1',
      p_actor_id: 'user-1',
      p_purpose: 'Education',
      p_requested_amount: 100_000,
      p_investee_id: 'investee-1',
      p_new_grantee: null,
      p_currency: 'USD',
      p_grant_type: null,
      p_grant_period_start: null,
      p_grant_period_end: null,
      p_lifecycle_stage: 'draft',
      p_internal_owner_id: null,
      p_risk_level: null,
      p_reporting_frequency: null,
      p_renewal_eligible: false,
      p_workflow_template_id: null,
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });

  it('forces lifecycle grant reads into the repository org scope', async () => {
    const query = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'grant-1', org_id: 'org-1', lifecycle_stage: 'draft' },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(query);
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.findWorkflowGrant('grant-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'grant-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('injects org, actor, and expected stage into the atomic transition RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const repository = createGrantRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.transitionLifecycle({
      grantId: 'grant-1',
      expectedFromStage: 'draft',
      targetStage: 'prospect',
      reason: 'Qualified prospect',
    });

    expect(mockRpc).toHaveBeenCalledWith('transition_grant_lifecycle', {
      p_grant_id: 'grant-1',
      p_expected_org_id: 'org-1',
      p_expected_from_stage: 'draft',
      p_to_stage: 'prospect',
      p_actor_id: 'user-1',
      p_reason: 'Qualified prospect',
      p_decision_payload: null,
    });
  });
});
