// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveCost } from '@/lib/api/repositories/ai-invocations';
import { RATE_VERSION } from '@/lib/ai/rates';

function record(overrides: Record<string, unknown> = {}) {
  return {
    requestedModel: 'claude-opus-5',
    resolvedModel: undefined,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    ...overrides,
  } as never;
}

describe('resolveCost', () => {
  it('prefers the provider-reported figure when present', () => {
    const cost = resolveCost(record({ reportedCost: 0.42, costCurrency: 'USD' }));
    expect(cost.cost_source).toBe('reported');
    expect(cost.reported_cost).toBe(0.42);
    expect(cost.computed_cost).toBeNull();
  });

  it('computes from the rate table when the provider reports nothing', () => {
    const cost = resolveCost(record());
    expect(cost.cost_source).toBe('computed');
    expect(cost.computed_cost).toBeCloseTo(5, 6);
    expect(cost.rate_version).toBe(RATE_VERSION);
    expect(cost.cost_currency).toBe('USD');
  });

  it('prices the resolved model when it differs from the requested one', () => {
    const cost = resolveCost(record({
      requestedModel: 'anthropic/claude-sonnet-5',
      resolvedModel: 'claude-sonnet-5',
    }));
    expect(cost.cost_source).toBe('computed');
    expect(cost.computed_cost).toBeCloseTo(3, 6);
  });

  it('records unpriced rather than guessing for an unknown model', () => {
    const cost = resolveCost(record({ requestedModel: 'some-unknown-model' }));
    expect(cost.cost_source).toBe('unpriced');
    expect(cost.computed_cost).toBeNull();
    expect(cost.rate_version).toBeNull();
  });

  it('records unpriced when there is no usage at all', () => {
    const cost = resolveCost(record({ usage: undefined }));
    expect(cost.cost_source).toBe('unpriced');
  });

  it('applies the cache discount from reported cached tokens', () => {
    const cost = resolveCost(record({
      usage: { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 },
    }));
    expect(cost.computed_cost).toBeCloseTo(0.5, 6);
  });
});
