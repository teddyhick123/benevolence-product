// lib/ai/__tests__/factory.test.ts
import { describe, it, expect } from 'vitest';

describe('createAIProvider', () => {
  it('returns a provider with createMessage and createStream', async () => {
    const { createAIProvider } = await import('../factory');
    const provider = createAIProvider('anthropic');
    expect(typeof provider.createMessage).toBe('function');
    expect(typeof provider.createStream).toBe('function');
  });

  it('uses AI_PROVIDER env var when no argument given', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    // Need to re-import because factory reads env at call time (not module load time)
    const { createAIProvider } = await import('../factory');
    const provider = createAIProvider();
    expect(typeof provider.createMessage).toBe('function');
    expect(typeof provider.createStream).toBe('function');
    delete process.env.AI_PROVIDER;
  });

  it('throws for unknown provider', async () => {
    const { createAIProvider } = await import('../factory');
    expect(() => createAIProvider('openai')).toThrow('Unknown AI provider: openai');
  });
});
