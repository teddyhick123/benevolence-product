// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkloadRoute, rpc } = vi.hoisted(() => ({
  getWorkloadRoute: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/lib/api/repositories/ai-routing', () => ({
  createAIRoutingRepository: () => ({ getWorkloadRoute }),
}));
vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: () => ({ rpc }),
}));

import { resolveOrganizationAIExecution } from '@/lib/ai/resolver';

const scope = {
  kind: 'organization' as const,
  orgId: '00000000-0000-4000-8000-000000000001',
  actorId: '00000000-0000-4000-8000-000000000002',
  portfolioId: '00000000-0000-4000-8000-000000000003',
  turnId: '00000000-0000-4000-8000-000000000004',
};

function configuredRoute(overrides: Record<string, unknown> = {}) {
  const connectionId = '00000000-0000-4000-8000-000000000010';
  const deploymentId = '00000000-0000-4000-8000-000000000011';
  return {
    route: {
      id: '00000000-0000-4000-8000-000000000012',
      is_enabled: true,
      policy: {
        experimentalUseAccepted: true,
        mutationTools: 'verified_only',
        fallbackOn: ['rate_limited', 'deployment_unavailable'],
      },
    },
    targets: [
      { position: 0, target_kind: 'deployment', deployment_id: deploymentId },
      { position: 1, target_kind: 'platform_default', deployment_id: null },
    ],
    deployments: [{
      id: deploymentId,
      connection_id: connectionId,
      status: 'active',
      catalog_template_id: 'openrouter-anthropic-claude-sonnet',
      provider_model_id: 'anthropic/claude-sonnet-4.5',
      config: {},
      verified_workloads: {},
    }],
    connections: [{
      id: connectionId,
      status: 'active',
      connector: 'openrouter',
      config: { provider: { zdr: true } },
    }],
    credentialAvailability: new Map([[connectionId, true]]),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('organization AI route resolution', () => {
  it('uses and binds the platform default only when no route row exists', async () => {
    getWorkloadRoute.mockResolvedValue(null);
    const plan = await resolveOrganizationAIExecution(scope, 'summaries');
    expect(plan).toMatchObject({ source: 'platform_default', targetPosition: 0 });
    expect(plan.targets).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('bind_ai_turn_execution_plan', expect.objectContaining({
      p_turn_id: scope.turnId,
      p_execution_plan: plan,
    }));
  });

  it('snapshots the complete explicit route and validated provider policy', async () => {
    getWorkloadRoute.mockResolvedValue(configuredRoute());
    const plan = await resolveOrganizationAIExecution(scope, 'assistant');
    expect(plan).toMatchObject({
      source: 'organization_route',
      routeId: '00000000-0000-4000-8000-000000000012',
      connector: 'openrouter',
      connectionId: '00000000-0000-4000-8000-000000000010',
      deploymentId: '00000000-0000-4000-8000-000000000011',
      providerPreferences: { zdr: true },
      toolMode: 'read_only',
    });
    expect(plan.targets.map(target => target.kind)).toEqual(['deployment', 'platform_default']);
    expect(plan.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('fails closed for disabled configured routes', async () => {
    const route = configuredRoute();
    route.route.is_enabled = false;
    getWorkloadRoute.mockResolvedValue(route);
    await expect(resolveOrganizationAIExecution(scope, 'assistant'))
      .rejects.toMatchObject({ code: 'policy_unsatisfied' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when a configured credential is unavailable', async () => {
    const route = configuredRoute();
    route.credentialAvailability = new Map([
      ['00000000-0000-4000-8000-000000000010', false],
    ]);
    getWorkloadRoute.mockResolvedValue(route);
    await expect(resolveOrganizationAIExecution(scope, 'assistant'))
      .rejects.toMatchObject({ code: 'credential_invalid' });
  });

  it('requires explicit acceptance for deployments without current evidence', async () => {
    const route = configuredRoute();
    route.route.policy.experimentalUseAccepted = false;
    getWorkloadRoute.mockResolvedValue(route);
    await expect(resolveOrganizationAIExecution(scope, 'assistant'))
      .rejects.toMatchObject({ code: 'policy_unsatisfied' });
  });

  it('allows full tools only with current passing assistant evidence', async () => {
    const route = configuredRoute();
    route.deployments[0].verified_workloads = {
      assistant: {
        evalSuiteVersion: 'assistant-v1',
        verifiedAt: new Date().toISOString(),
        result: 'passed',
      },
    };
    getWorkloadRoute.mockResolvedValue(route);
    const plan = await resolveOrganizationAIExecution(scope, 'assistant');
    expect(plan.toolMode).toBe('full');
  });
});
