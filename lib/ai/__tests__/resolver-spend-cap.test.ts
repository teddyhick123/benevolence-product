// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkloadRoute, rpc, getStatus } = vi.hoisted(() => ({
  getWorkloadRoute: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  getStatus: vi.fn(),
}));

vi.mock('@/lib/api/repositories/ai-routing', () => ({
  createAIRoutingRepository: () => ({ getWorkloadRoute }),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: () => ({ rpc }) }));
vi.mock('@/lib/api/repositories/ai-spend-caps', () => ({
  createAISpendCapRepository: () => ({ getStatus }),
}));

import { resolveOrganizationAIExecution } from '@/lib/ai/resolver';
import { RESOLVER_SCOPE, connectorRoute } from './resolver-fixtures';

function underCap() {
  return { state: 'under', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  getStatus.mockResolvedValue(underCap());
  getWorkloadRoute.mockResolvedValue(null);
});

describe('read_only at the cap', () => {
  it('strips write tools from a platform-default plan', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'read_only' });
    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.toolMode).toBe('read_only');
  });

  it('leaves tools alone below the cap', async () => {
    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.toolMode).toBe('full');
  });
});

describe('own_key at the cap', () => {
  it('resolves to an organization deployment instead of the platform default', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'own_key' });
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'anthropic',
      catalogTemplateId: 'anthropic-claude-opus-5',
      providerModelId: 'claude-opus-5',
    }));

    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');
    expect(plan.targets[0].kind).toBe('deployment');
  });

  // Without an eligible deployment there is nowhere to fall back to, and
  // continuing would spend past the cap.
  it('degrades to a refusal when no eligible deployment exists', async () => {
    getStatus.mockResolvedValue({ ...underCap(), state: 'over', onLimit: 'own_key' });
    getWorkloadRoute.mockResolvedValue(null);

    await expect(resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant'))
      .rejects.toMatchObject({ code: 'policy_unsatisfied' });
  });
});

describe('platform tooling', () => {
  it('does not consult the cap for non-routable workloads', async () => {
    await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'builder_plan');
    expect(getStatus).not.toHaveBeenCalled();
  });
});
