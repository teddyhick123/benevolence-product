// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { effectiveLimit, capState, periodStartFor } from '@/lib/api/repositories/ai-spend-caps';

describe('effectiveLimit', () => {
  it('takes the lower of the two limits', () => {
    expect(effectiveLimit(500, 200)).toBe(200);
    expect(effectiveLimit(200, 500)).toBe(200);
  });

  // A null limit is absent, not zero. Treating it as zero would cap every
  // organization at nothing the moment a row exists.
  it('treats null as absent rather than zero', () => {
    expect(effectiveLimit(500, null)).toBe(500);
    expect(effectiveLimit(null, 200)).toBe(200);
    expect(effectiveLimit(null, null)).toBeNull();
  });
});

describe('capState', () => {
  it('is uncapped when there is no effective limit', () => {
    expect(capState({ effectiveLimitUsd: null, spendUsd: 9999, warnAtPercent: 80 })).toBe('uncapped');
  });

  it('is under below the warning threshold', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 79, warnAtPercent: 80 })).toBe('under');
  });

  it('warns at the threshold', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 80, warnAtPercent: 80 })).toBe('warn');
  });

  it('is over at exactly the limit, not just past it', () => {
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 100, warnAtPercent: 80 })).toBe('over');
    expect(capState({ effectiveLimitUsd: 100, spendUsd: 100.01, warnAtPercent: 80 })).toBe('over');
  });

  it('is over when the limit is zero and nothing has been spent', () => {
    expect(capState({ effectiveLimitUsd: 0, spendUsd: 0, warnAtPercent: 80 })).toBe('over');
  });
});

describe('periodStartFor', () => {
  it('is the first instant of the calendar month in UTC', () => {
    expect(periodStartFor(new Date('2026-08-24T13:45:00Z')).toISOString())
      .toBe('2026-08-01T00:00:00.000Z');
  });
});
