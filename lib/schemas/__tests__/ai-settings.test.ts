import { describe, expect, it } from 'vitest';
import {
  aiConnectionCreateSchema,
  aiRouteReplaceSchema,
  openRouterProviderPreferencesSchema,
} from '@/lib/schemas/ai-settings';

describe('organization AI settings schemas', () => {
  it('only accepts the fixed OpenRouter origin', () => {
    expect(aiConnectionCreateSchema.safeParse({
      connector: 'openrouter',
      name: 'Organization account',
      endpointUrl: 'https://openrouter.ai/api/v1',
      credential: { apiKey: 'sk-or-valid-test-key' },
    }).success).toBe(true);
    expect(aiConnectionCreateSchema.safeParse({
      connector: 'openrouter',
      name: 'Unsafe account',
      endpointUrl: 'https://example.test/proxy',
      credential: { apiKey: 'sk-or-valid-test-key' },
    }).success).toBe(false);
  });

  it('rejects mutually contradictory provider lists', () => {
    expect(openRouterProviderPreferencesSchema.safeParse({
      only: ['Together'],
      ignore: ['Together'],
    }).success).toBe(false);
  });

  it('accepts a complete ordered route and rejects duplicate deployments', () => {
    const deploymentId = '00000000-0000-4000-8000-000000000001';
    expect(aiRouteReplaceSchema.safeParse({
      workloadId: 'summaries',
      targets: [
        { kind: 'deployment', deploymentId },
        { kind: 'platform_default' },
      ],
    }).success).toBe(true);
    expect(aiRouteReplaceSchema.safeParse({
      workloadId: 'summaries',
      targets: [
        { kind: 'deployment', deploymentId },
        { kind: 'deployment', deploymentId },
      ],
    }).success).toBe(false);
  });

  it('requires explicit acceptance before experimental mutation tools', () => {
    expect(aiRouteReplaceSchema.safeParse({
      workloadId: 'assistant',
      policy: { mutationTools: 'allow_experimental' },
      targets: [{ kind: 'platform_default' }],
    }).success).toBe(false);
  });
});
