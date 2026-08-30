// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));

vi.mock('@/lib/api/repositories/ai-spend-caps', () => ({
  createAISpendCapRepository: () => ({ getStatus }),
}));

import { isBlockedBySpendCap } from '@/lib/builder/proposal-state';

beforeEach(() => vi.clearAllMocks());

describe('builder spend cap', () => {
  it('blocks a run when the organization is over its cap', async () => {
    getStatus.mockResolvedValue({ state: 'over', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 120 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: true });
  });

  // Builder is platform-funded and non-routable, so own_key cannot apply and
  // read_only is meaningless for a scaffold run.
  it('blocks regardless of the configured behaviour', async () => {
    for (const onLimit of ['read_only', 'own_key'] as const) {
      getStatus.mockResolvedValue({ state: 'over', onLimit, effectiveLimitUsd: 100, spendUsd: 120 });
      await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: true });
    }
  });

  it('allows a run below the cap', async () => {
    getStatus.mockResolvedValue({ state: 'under', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 1 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: false });
  });

  it('allows a run when the organization is uncapped', async () => {
    getStatus.mockResolvedValue({ state: 'uncapped', onLimit: 'hard_stop', effectiveLimitUsd: null, spendUsd: 999 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({ blocked: false });
  });

  it('reports the limit and spend so the failure can name them', async () => {
    getStatus.mockResolvedValue({ state: 'over', onLimit: 'hard_stop', effectiveLimitUsd: 100, spendUsd: 120 });
    await expect(isBlockedBySpendCap('org-1')).resolves.toMatchObject({
      blocked: true,
      limitUsd: 100,
      spendUsd: 120,
    });
  });
});
