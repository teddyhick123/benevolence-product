// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { AnthropicProvider } = vi.hoisted(() => ({ AnthropicProvider: vi.fn() }));

vi.mock('@/lib/ai/providers/anthropic', () => ({ AnthropicProvider }));

import { createAIConnector } from '@/lib/ai/connectors/registry';

beforeEach(() => {
  AnthropicProvider.mockClear();
});

describe('Anthropic connector construction', () => {
  it('binds an organization key when one is supplied', () => {
    createAIConnector('anthropic', { anthropic: { apiKey: 'org-supplied-key' } });

    expect(AnthropicProvider).toHaveBeenCalledWith('org-supplied-key');
  });

  it('falls back to the platform key when no context is supplied', () => {
    createAIConnector('anthropic');

    expect(AnthropicProvider).toHaveBeenCalledWith(undefined);
  });
});
