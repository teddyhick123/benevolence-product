// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingProvisioner } from '@/lib/api/repositories/onboarding-provisioning';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockEnableModule,
  mockContextRows,
  mockViewRows,
  mockWorkflowRows,
  mockCustomFieldRows,
  mockAutomationRows,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockEnableModule: vi.fn(),
  mockContextRows: vi.fn(),
  mockViewRows: vi.fn(),
  mockWorkflowRows: vi.fn(),
  mockCustomFieldRows: vi.fn(),
  mockAutomationRows: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/modules', () => ({
  enableModule: mockEnableModule,
}));

vi.mock('@/lib/onboarding-provision-config', () => ({
  contextRowsFromOnboardingProfile: mockContextRows,
  viewRowsFromOnboardingProfile: mockViewRows,
  workflowRowsFromOnboardingProfile: mockWorkflowRows,
  customFieldRowsFromOnboardingProfile: mockCustomFieldRows,
  automationRowsFromOnboardingProfile: mockAutomationRows,
}));

const db = { from: mockFrom, rpc: mockRpc };
const baseInput = {
  name: 'Example Foundation',
  orgType: 'private_foundation' as const,
  requestedModules: null,
  selectedModuleIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: 'org-1', error: null });
  mockEnableModule.mockResolvedValue({ success: true, enabledModules: [] });
  mockContextRows.mockReturnValue([]);
  mockViewRows.mockReturnValue([]);
  mockWorkflowRows.mockReturnValue([]);
  mockCustomFieldRows.mockReturnValue([]);
  mockAutomationRows.mockReturnValue([]);
});

describe('onboarding provisioning repository', () => {
  it('rejects an unowned onboarding session before membership or provisioning work', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(sessionQuery);

    const promise = createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
    });

    await expect(promise).rejects.toMatchObject({
      message: 'Onboarding session not found',
      status: 404,
    });
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects provisioning when the user already belongs to an unrelated organization', async () => {
    const membershipQuery = stubQuery({
      data: [{ org_id: 'org-existing', role: 'owner' }],
      error: null,
    });
    mockFrom.mockReturnValue(membershipQuery);

    const promise = createOnboardingProvisioner('user-1').provision(baseInput);

    await expect(promise).rejects.toMatchObject({
      message: 'User already belongs to an organization',
      status: 409,
    });
    expect(membershipQuery.calls).toContainEqual({
      method: 'eq',
      args: ['user_id', 'user-1'],
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('provisions a new organization, portfolio, and owner membership from user scope', async () => {
    const membershipQuery = stubQuery({ data: [], error: null });
    const portfolioInsert = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'portfolio-1' }, error: null } }
    );
    const portfolioMemberInsert = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(portfolioInsert)
      .mockReturnValueOnce(portfolioMemberInsert);

    const result = await createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      ein: ' 12-3456789 ',
      requestedModules: { portfolio: true },
    });

    expect(mockRpc).toHaveBeenCalledWith('provision_organization', {
      p_name: 'Example Foundation',
      p_org_type: 'private_foundation',
      p_owner_user_id: 'user-1',
      p_ein: '12-3456789',
      p_modules: { portfolio: true },
    });
    expect(portfolioInsert.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({ org_id: 'org-1', owner_id: 'user-1' })],
    });
    expect(portfolioMemberInsert.calls).toContainEqual({
      method: 'insert',
      args: [{ portfolio_id: 'portfolio-1', user_id: 'user-1', role: 'owner' }],
    });
    expect(result).toMatchObject({ orgId: 'org-1', portfolioId: 'portfolio-1' });
  });

  it('scopes blueprint configuration and completion to the owned session and new org', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            org_id: null,
            started_at: '2026-08-03T00:00:00.000Z',
          },
          error: null,
        },
      }
    );
    const membershipQuery = stubQuery({ data: [], error: null });
    const portfolioInsert = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'portfolio-1' }, error: null } }
    );
    const portfolioMemberInsert = stubQuery({ data: null, error: null });
    const profileQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { workflows: {} }, error: null } }
    );
    const upserts = Array.from({ length: 5 }, () => stubQuery({ data: null, error: null }));
    const sessionUpdate = stubQuery({ data: null, error: null });
    const analyticsUpdate = stubQuery({ data: null, error: null });

    mockContextRows.mockReturnValue([{ org_id: 'org-1', context_key: 'context-1' }]);
    mockViewRows.mockReturnValue([{ org_id: 'org-1', scope_key: 'view-1' }]);
    mockWorkflowRows.mockReturnValue([{ org_id: 'org-1', config_key: 'workflow-1' }]);
    mockCustomFieldRows.mockReturnValue([{ org_id: 'org-1', field_key: 'field-1' }]);
    mockAutomationRows.mockReturnValue([{
      org_id: 'org-1',
      onboarding_session_id: 'session-1',
      name: 'automation-1',
    }]);
    mockFrom
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(portfolioInsert)
      .mockReturnValueOnce(portfolioMemberInsert)
      .mockReturnValueOnce(profileQuery);
    for (const upsert of upserts) mockFrom.mockReturnValueOnce(upsert);
    mockFrom
      .mockReturnValueOnce(sessionUpdate)
      .mockReturnValueOnce(analyticsUpdate);

    await createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
    });

    expect(profileQuery.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
    for (const upsert of upserts) {
      expect(upsert.calls).toContainEqual({
        method: 'upsert',
        args: [expect.arrayContaining([expect.objectContaining({ org_id: 'org-1' })]), expect.anything()],
      });
    }
    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(analyticsUpdate.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
  });

  it('reuses the owned organization and portfolio for a partial-setup retry', async () => {
    mockContextRows.mockReturnValue([]);
    mockViewRows.mockReturnValue([]);
    mockWorkflowRows.mockReturnValue([]);
    mockCustomFieldRows.mockReturnValue([]);
    mockAutomationRows.mockReturnValue([]);
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            org_id: 'org-1',
            started_at: null,
          },
          error: null,
        },
      }
    );
    const membershipQuery = stubQuery({
      data: [{ org_id: 'org-1', role: 'owner' }],
      error: null,
    });
    const portfolioQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'portfolio-1' }, error: null } }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { workflows: {} }, error: null } }
    );
    const sessionUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(portfolioQuery)
      .mockReturnValueOnce(profileQuery)
      .mockReturnValueOnce(sessionUpdate);

    const result = await createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalledWith('portfolio_members');
    expect(portfolioQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(portfolioQuery.calls).toContainEqual({ method: 'eq', args: ['owner_id', 'user-1'] });
    expect(result).toMatchObject({ orgId: 'org-1', portfolioId: 'portfolio-1' });
  });

  it('preserves module failures as a partial result', async () => {
    mockEnableModule.mockResolvedValueOnce({ success: false, error: 'dependency unavailable' });
    const membershipQuery = stubQuery({ data: [], error: null });
    const portfolioInsert = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'portfolio-1' }, error: null } }
    );
    const portfolioMemberInsert = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(portfolioInsert)
      .mockReturnValueOnce(portfolioMemberInsert);

    const result = await createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      selectedModuleIds: ['analytics'],
    });

    expect(mockEnableModule).toHaveBeenCalledWith(db, 'org-1', 'analytics', 'user-1');
    expect(result.moduleErrors).toEqual(['analytics: dependency unavailable']);
  });

  it('cleans up a newly provisioned organization when portfolio creation fails', async () => {
    const membershipQuery = stubQuery({ data: [], error: null });
    const portfolioInsert = stubQuery(
      { data: null, error: null },
      { single: { data: null, error: { message: 'portfolio failed' } } }
    );
    const cleanup = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(portfolioInsert)
      .mockReturnValueOnce(cleanup);

    const promise = createOnboardingProvisioner('user-1').provision(baseInput);

    await expect(promise).rejects.toMatchObject({
      message: 'portfolio failed',
      status: 500,
    });
    expect(cleanup.calls).toContainEqual({ method: 'delete', args: [] });
    expect(cleanup.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] });
  });

  it('does not expose the elevated client', () => {
    const provisioner = createOnboardingProvisioner('user-1');
    expect(provisioner).not.toHaveProperty('db');
    expect(provisioner).not.toHaveProperty('from');
    expect(provisioner).toEqual({ provision: expect.any(Function) });
  });
});
