import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAiUsageReport } = vi.hoisted(() => ({ useAiUsageReport: vi.fn() }));
vi.mock('@/lib/ai/hooks', () => ({ useAiUsageReport }));

import AIUsagePanel from '../AIUsagePanel';

function withData(cap: Record<string, unknown>) {
  useAiUsageReport.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      cap: { warnAtPercent: 80, periodStart: '2026-08-01T00:00:00.000Z', ...cap },
      report: {
        period_start: '2026-08-01T00:00:00.000Z',
        platform_cost: 412.8,
        org_cost: 88.2,
        invocations: 120,
        failed_invocations: 2,
        by_workload: [
          { workload_id: 'assistant', funding: 'platform', cost: 210.4, invocations: 80 },
          { workload_id: 'builder_review', funding: 'platform', cost: 202.4, invocations: 40 },
        ],
        daily: [{ day: '2026-08-01', platform_cost: 12.5, org_cost: 1 }],
      },
    },
  });
  render(<AIUsagePanel orgId="org-1" />);
}

beforeEach(() => useAiUsageReport.mockReset());

describe('AIUsagePanel', () => {
  it('separates platform-funded spend from the organization own-key spend', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText(/\$412\.80/)).toBeTruthy();
    expect(screen.getByText(/\$88\.20/)).toBeTruthy();
    expect(screen.getByText(/not capped/i)).toBeTruthy();
  });

  it('shows the limit alongside the spend', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText(/of \$500\.00/)).toBeTruthy();
  });

  it('warns when approaching the limit', () => {
    withData({ state: 'warn', effectiveLimitUsd: 500, spendUsd: 420, onLimit: 'hard_stop' });
    expect(screen.getByText(/approaching/i)).toBeTruthy();
  });

  it('states plainly when the limit is reached', () => {
    withData({ state: 'over', effectiveLimitUsd: 500, spendUsd: 500, onLimit: 'hard_stop' });
    expect(screen.getByText(/limit reached/i)).toBeTruthy();
  });

  it('says nothing about a limit when the organization is uncapped', () => {
    withData({ state: 'uncapped', effectiveLimitUsd: null, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.queryByText(/limit reached/i)).toBeNull();
    expect(screen.getByText(/no limit set/i)).toBeTruthy();
  });

  it('breaks platform spend down by workload', () => {
    withData({ state: 'under', effectiveLimitUsd: 500, spendUsd: 412.8, onLimit: 'hard_stop' });
    expect(screen.getByText('assistant')).toBeTruthy();
    expect(screen.getByText('builder_review')).toBeTruthy();
  });

  // own_key can quietly become read_only when the fallback deployment is
  // unverified, so the panel must say where execution moved to.
  it('names the fallback state when own_key is active at the cap', () => {
    withData({ state: 'over', effectiveLimitUsd: 500, spendUsd: 500, onLimit: 'own_key' });
    expect(screen.getByText(/your own key/i)).toBeTruthy();
    expect(screen.getByText(/own_key|your own model|switched/i)).toBeTruthy();
  });
});
