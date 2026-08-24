// lib/ai/rates.ts
// Per-model list prices, in USD per million tokens, used to price calls the
// provider does not report a cost for. Rates live in code so the coverage
// guard can check them at build time and so a price change is reviewed.

export type ModelRate = {
  inputPerMTok: number;
  /** Cache-read rate. A tenth of input for Anthropic models. */
  cachedPerMTok: number;
  outputPerMTok: number;
};

export type PricedUsage = {
  inputTokens: number;
  outputTokens: number;
  /** A SUBSET of inputTokens, never an addition. */
  cachedInputTokens?: number;
};

/**
 * Bumped whenever any rate changes. Stored on every row priced under it so a
 * historical figure can be traced to the table that produced it.
 */
export const RATE_VERSION = '2026-08';

/**
 * Sonnet 5 is deliberately at standard pricing, not its introductory
 * $2 / $10 which expires 2026-08-31. Over-pricing is the safe direction:
 * under-pricing would let a future spend cap pass spend it should stop.
 */
export const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  'claude-opus-5': { inputPerMTok: 5, cachedPerMTok: 0.5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 3, cachedPerMTok: 0.3, outputPerMTok: 15 },
};

const PER_MTOK = 1_000_000;

export function priceFor(
  model: string,
  usage: PricedUsage,
): { cost: number; rateVersion: string } | null {
  const rate = MODEL_RATES[model];
  if (!rate) return null;

  // Cached tokens are already counted in inputTokens by the OpenAI-compatible
  // connectors, so they are subtracted rather than added. Clamped at zero
  // because a provider reporting more cached than total must not yield a
  // negative charge.
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const billableInput = Math.max(usage.inputTokens - cached, 0);

  const cost =
    (billableInput * rate.inputPerMTok
      + cached * rate.cachedPerMTok
      + usage.outputTokens * rate.outputPerMTok) / PER_MTOK;

  return { cost, rateVersion: RATE_VERSION };
}
