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
import { RESOLVER_SCOPE, connectorRoute } from './resolver-fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('resolver connector awareness', () => {
  it('resolves a direct Anthropic deployment', async () => {
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'anthropic',
      catalogTemplateId: 'anthropic-claude-opus-5',
      providerModelId: 'claude-opus-5',
    }));

    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');

    expect(plan.targets[0].connector).toBe('anthropic');
    expect(plan.targets[0].requestedModel).toBe('claude-opus-5');
    expect(plan.targets[0].providerPreferences).toBeUndefined();
  });

  it('resolves a direct OpenAI deployment', async () => {
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'openai',
      catalogTemplateId: 'openai-gpt-5-6-sol',
      providerModelId: 'gpt-5.6-sol',
    }));

    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');

    expect(plan.targets[0].connector).toBe('openai');
    expect(plan.targets[0].requestedModel).toBe('gpt-5.6-sol');
  });

  it('still carries provider preferences for OpenRouter', async () => {
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'openrouter',
      catalogTemplateId: 'openrouter-anthropic-claude-opus-5',
      providerModelId: 'anthropic/claude-opus-5',
      connectionConfig: { provider: { order: ['anthropic'] } },
    }));

    const plan = await resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant');

    expect(plan.targets[0].connector).toBe('openrouter');
    expect(plan.targets[0].providerPreferences).toMatchObject({ order: ['anthropic'] });
  });

  it('still rejects a deployment with no catalog template', async () => {
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'anthropic',
      catalogTemplateId: null,
    }));

    await expect(resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant'))
      .rejects.toThrow(/unsupported/i);
  });

  it('rejects a connector the platform does not implement', async () => {
    getWorkloadRoute.mockResolvedValue(connectorRoute({
      connector: 'bedrock',
      catalogTemplateId: 'anthropic-claude-opus-5',
    }));

    await expect(resolveOrganizationAIExecution(RESOLVER_SCOPE, 'assistant'))
      .rejects.toThrow(/unsupported/i);
  });
});
