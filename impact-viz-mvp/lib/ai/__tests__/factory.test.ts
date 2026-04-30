// lib/ai/__tests__/factory.test.ts
import { describe, it, expect } from 'vitest';

describe('createAIProvider', () => {
  it('returns a provider with createMessage and createStream', async () => {
    const { createAIProvider } = await import('../factory');
    const provider = createAIProvider('anthropic');
    expect(typeof provider.createMessage).toBe('function');
    expect(typeof provider.createStream).toBe('function');
  });

  it('throws for unknown provider', async () => {
    const { createAIProvider } = await import('../factory');
    expect(() => createAIProvider('openai')).toThrow('Unknown AI provider: openai');
  });
});
