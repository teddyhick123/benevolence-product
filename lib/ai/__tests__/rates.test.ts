// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { MODEL_RATES, RATE_VERSION, priceFor } from '@/lib/ai/rates';
import { AI_MODELS } from '@/lib/ai/models';
import { AI_WORKLOADS } from '@/lib/ai/workloads';

describe('rate coverage guard', () => {
  // A platform-default model shipping without a rate would record spend the
  // platform pays for as costing nothing.
  it('prices every platform-default model', () => {
    const models = new Set<string>([
      ...Object.values(AI_MODELS),
      ...Object.values(AI_WORKLOADS)
        .filter(workload => !workload.orgRoutable)
        .map(workload => workload.platformDefault.model),
    ]);
    for (const model of models) {
      expect(MODEL_RATES[model], `${model} has no rate`).toBeDefined();
    }
  });

  it('states a rate version', () => {
    expect(RATE_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('priceFor', () => {
  it('prices input and output at the published rates', () => {
    // 1M input at $5 + 1M output at $25 on Opus 5.
    const priced = priceFor('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(priced?.cost).toBeCloseTo(30, 6);
    expect(priced?.rateVersion).toBe(RATE_VERSION);
  });

  // Cached tokens are a SUBSET of input tokens, not an addition. Adding them
  // would double-bill every OpenRouter call.
  it('discounts cached tokens rather than adding them', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    // All input was a cache read: 1M x $0.50, not 1M x $5 + 1M x $0.50.
    expect(priced?.cost).toBeCloseTo(0.5, 6);
  });

  it('prices the uncached remainder at the full input rate', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 0,
    });
    // 600k x $5/M + 400k x $0.50/M = 3.00 + 0.20
    expect(priced?.cost).toBeCloseTo(3.2, 6);
  });

  it('returns null for a model with no rate', () => {
    expect(priceFor('some-unknown-model', { inputTokens: 100, outputTokens: 100 })).toBeNull();
  });

  it('prices a zero-token call as zero, not null', () => {
    expect(priceFor('claude-opus-5', { inputTokens: 0, outputTokens: 0 })?.cost).toBe(0);
  });

  it('never returns a negative cost when cached exceeds input', () => {
    const priced = priceFor('claude-opus-5', {
      inputTokens: 100,
      cachedInputTokens: 5_000,
      outputTokens: 0,
    });
    expect(priced?.cost).toBeGreaterThanOrEqual(0);
  });
});
