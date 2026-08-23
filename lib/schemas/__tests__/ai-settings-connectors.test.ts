// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  aiConnectionCreateSchema,
  assertConnectionConfigMatchesConnector,
} from '@/lib/schemas/ai-settings';

const API_KEY = 'sk-test-0123456789abcdef';

describe('AI connection create schema', () => {
  it('accepts an OpenRouter connection with routing preferences', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'openrouter',
      name: 'Ford OpenRouter',
      config: { provider: { order: ['anthropic'] } },
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('openrouter');
  });

  it('accepts a direct Anthropic connection', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('anthropic');
  });

  it('accepts a direct OpenAI connection', () => {
    const parsed = aiConnectionCreateSchema.parse({
      connector: 'openai',
      name: 'Ford OpenAI',
      credential: { apiKey: API_KEY },
    });
    expect(parsed.connector).toBe('openai');
  });

  it('rejects OpenRouter routing preferences on a direct provider', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      config: { provider: { order: ['anthropic'] } },
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an endpoint belonging to a different provider', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'anthropic',
      name: 'Ford Anthropic',
      endpointUrl: 'https://openrouter.ai/api/v1',
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown connector', () => {
    const result = aiConnectionCreateSchema.safeParse({
      connector: 'bedrock',
      name: 'Nope',
      credential: { apiKey: API_KEY },
    });
    expect(result.success).toBe(false);
  });
});

describe('assertConnectionConfigMatchesConnector', () => {
  it('allows provider preferences on openrouter', () => {
    expect(() => assertConnectionConfigMatchesConnector(
      'openrouter',
      { provider: { order: ['anthropic'] } },
    )).not.toThrow();
  });

  it('allows an empty config on any connector', () => {
    expect(() => assertConnectionConfigMatchesConnector('anthropic', {})).not.toThrow();
    expect(() => assertConnectionConfigMatchesConnector('openai', {})).not.toThrow();
  });

  it('rejects provider preferences on a direct provider', () => {
    expect(() => assertConnectionConfigMatchesConnector(
      'anthropic',
      { provider: { order: ['anthropic'] } },
    )).toThrow(/routing preferences/i);
  });
});
