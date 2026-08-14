// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingProvisioner } from '@/lib/api/repositories/onboarding-provisioning';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockEnableModule,
  mockGetRequiredModules,
  mockToDbModuleSlug,
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
  mockGetRequiredModules: vi.fn(),
  mockToDbModuleSlug: vi.fn(),
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
  getRequiredModules: mockGetRequiredModules,
  toDbModuleSlug: mockToDbModuleSlug,
}));

vi.mock('@/lib/onboarding/provision-config', () => ({
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
  mockGetRequiredModules.mockReturnValue([]);
  mockToDbModuleSlug.mockImplementation((moduleId: string) => moduleId === 'core' ? 'portfolio' : moduleId);
  mockContextRows.mockReturnValue([]);
  mockViewRows.mockReturnValue([]);
  mockWorkflowRows.mockReturnValue([]);
  mockCustomFieldRows.mockReturnValue([]);
  mockAutomationRows.mockReturnValue([]);
});

describe('onboarding provisioning repository', () => {
  it('rejects an unowned onboarding session before provisioning work', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(sessionQuery);

    await expect(createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
    })).rejects.toMatchObject({ message: 'Onboarding session not found', status: 404 });

    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses the session-scoped transactional RPC with all blueprint layers', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1', user_id: 'user-1', org_id: null }, error: null } }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { workflows: {} }, error: null } }
    );
    mockFrom.mockReturnValueOnce(sessionQuery).mockReturnValueOnce(profileQuery);
    mockContextRows.mockReturnValue([{ org_id: 'session-1', context_key: 'context-1' }]);
    mockViewRows.mockReturnValue([{ org_id: 'session-1', scope_key: 'view-1' }]);
    mockWorkflowRows.mockReturnValue([{ org_id: 'session-1', config_key: 'workflow-1' }]);
    mockCustomFieldRows.mockReturnValue([{ org_id: 'session-1', field_key: 'field-1' }]);
    mockAutomationRows.mockReturnValue([{ org_id: 'session-1', name: 'automation-1' }]);
    mockGetRequiredModules.mockReturnValue(['impact_tracking']);
    mockToDbModuleSlug.mockImplementation((moduleId: string) => ({
      analytics: 'analytics', impact_tracking: 'impact_tracking', core: 'portfolio',
    }[moduleId] ?? moduleId));
    mockRpc.mockResolvedValueOnce({
      data: { org_id: 'org-1', portfolio_id: 'portfolio-1', enabled_modules: ['portfolio', 'impact_tracking', 'analytics'] },
      error: null,
    });

    const result = await createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
      selectedModuleIds: ['analytics'],
    });

    expect(mockRpc).toHaveBeenCalledWith('provision_onboarding_session', expect.objectContaining({
      p_session_id: 'session-1',
      p_owner_user_id: 'user-1',
      p_modules: { portfolio: true, analytics: true, impact_tracking: true },
      p_context_rows: [{ context_key: 'context-1' }],
      p_view_rows: [{ scope_key: 'view-1' }],
      p_workflow_rows: [{ config_key: 'workflow-1' }],
      p_custom_field_rows: [{ field_key: 'field-1' }],
      p_automation_rows: [{ name: 'automation-1' }],
    }));
    expect(mockEnableModule).not.toHaveBeenCalled();
    expect(result).toEqual({
      orgId: 'org-1', portfolioId: 'portfolio-1',
      enabledModules: ['portfolio', 'impact_tracking', 'analytics'], moduleErrors: [], setupErrors: [],
    });
  });

  it('maps a transactional idempotency conflict without exposing elevated access', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1', user_id: 'user-1', org_id: null }, error: null } }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValueOnce(sessionQuery).mockReturnValueOnce(profileQuery);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'User already belongs to an organization' } });

    await expect(createOnboardingProvisioner('user-1').provision({
      ...baseInput,
      sessionId: 'session-1',
    })).rejects.toMatchObject({ message: 'User already belongs to an organization', status: 409 });

    const provisioner = createOnboardingProvisioner('user-1');
    expect(provisioner).toEqual({ provision: expect.any(Function) });
    expect(provisioner).not.toHaveProperty('db');
  });

  it('retains the legacy no-session provisioner for non-guided callers', async () => {
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
      p_name: 'Example Foundation', p_org_type: 'private_foundation', p_owner_user_id: 'user-1',
      p_ein: '12-3456789', p_modules: { portfolio: true },
    });
    expect(result).toMatchObject({ orgId: 'org-1', portfolioId: 'portfolio-1' });
  });
});
