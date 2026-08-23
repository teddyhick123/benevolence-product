// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAIConnector, withCredential, createAICredentialRepository } = vi.hoisted(() => {
  const withCredential = vi.fn();
  return {
    createAIConnector: vi.fn((..._args: unknown[]) => ({ id: 'stub' })),
    withCredential,
    createAICredentialRepository: vi.fn(() => ({ withCredential })),
  };
});

vi.mock('@/lib/ai/connectors/registry', () => ({ createAIConnector }));
vi.mock('@/lib/api/repositories/ai-credentials', () => ({ createAICredentialRepository }));
vi.mock('@/lib/api/repositories/ai-invocations', () => ({
  createAIInvocationRecorder: () => ({ record: vi.fn() }),
}));

import { createAIExecutionGateway } from '@/lib/ai/runtime';

const ORG_SCOPE = { kind: 'organization' as const, orgId: 'org-1', actorId: 'user-1' };
const CONNECTION_ID = '00000000-0000-4000-8000-000000000010';

/** Reach the gateway's connector factory without running a full turn. */
function connectorFactory() {
  const gateway = createAIExecutionGateway(ORG_SCOPE) as unknown as {
    dependencies: { connector: (plan: unknown) => Promise<unknown> };
  };
  return gateway.dependencies.connector;
}

beforeEach(() => {
  createAIConnector.mockClear();
  createAICredentialRepository.mockClear();
  withCredential.mockReset();
  withCredential.mockImplementation((_id: string, fn: (c: { apiKey: string }) => unknown) =>
    Promise.resolve(fn({ apiKey: 'org-supplied-key' })));
});

describe('gateway credential source', () => {
  it('loads the org credential for a direct Anthropic deployment', async () => {
    await connectorFactory()({
      connector: 'anthropic',
      connectionId: CONNECTION_ID,
      requestedModel: 'claude-opus-5',
    });

    expect(withCredential).toHaveBeenCalledWith(CONNECTION_ID, expect.any(Function));
    expect(createAIConnector).toHaveBeenCalledWith('anthropic', expect.objectContaining({
      anthropic: { apiKey: 'org-supplied-key' },
    }));
  });

  it('loads the org credential for a direct OpenAI deployment', async () => {
    await connectorFactory()({
      connector: 'openai',
      connectionId: CONNECTION_ID,
      requestedModel: 'gpt-5.6-sol',
    });

    expect(createAIConnector).toHaveBeenCalledWith('openai', expect.objectContaining({
      openai: { apiKey: 'org-supplied-key' },
    }));
  });

  it('still loads the org credential for OpenRouter', async () => {
    await connectorFactory()({
      connector: 'openrouter',
      connectionId: CONNECTION_ID,
      requestedModel: 'anthropic/claude-opus-5',
      providerPreferences: {},
    });

    expect(createAIConnector).toHaveBeenCalledWith('openrouter', expect.objectContaining({
      openrouter: expect.objectContaining({ apiKey: 'org-supplied-key' }),
    }));
  });

  // The regression guard. A platform-key connector must never be constructed
  // for a plan that names an org connection, whatever the connector is called.
  it('never builds an unkeyed connector when the plan names a connection', async () => {
    for (const connector of ['anthropic', 'openai', 'openrouter']) {
      createAIConnector.mockClear();
      await connectorFactory()({ connector, connectionId: CONNECTION_ID, requestedModel: 'm' });

      for (const call of createAIConnector.mock.calls) {
        expect(call[1]).toBeDefined();
      }
    }
  });

  it('uses the platform connector only when no connection is named', async () => {
    await connectorFactory()({ connector: 'anthropic', requestedModel: 'claude-opus-5' });

    expect(withCredential).not.toHaveBeenCalled();
    expect(createAIConnector).toHaveBeenCalledWith('anthropic');
  });
});
