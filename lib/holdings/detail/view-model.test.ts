import { describe, expect, it } from 'vitest';
import { buildHoldingDetailViewModel } from './view-model';
import type { HoldingRow } from './types';

const holding: HoldingRow = {
  id: 'holding',
  org_id: 'org',
  portfolio_id: 'portfolio',
  name: 'Example',
  funds_allocated: 500,
  total_org_funding: 2_000,
};

describe('holding detail view model', () => {
  it('prefers contribution totals and applies proportional attribution', () => {
    const result = buildHoldingDetailViewModel(
      holding,
      [{ id: 'fact', holding_id: 'holding', metric_code: 'JOBS', value: 100, updated_at: '2026-01-01' }],
      [{ id: 'contribution', portfolio_id: 'portfolio', holding_id: 'holding', amount: 1_000, contributed_at: '2026-01-01' }],
      new Map([['JOBS', 'Jobs created']]),
    );

    expect(result.funds).toBe(1_000);
    expect(result.kpiCards[0]).toMatchObject({
      displayName: 'Jobs created',
      attributedOutcomes: 50,
      costPerOutcome: 20,
      outcomesPerThousand: 50,
      hasProportionalAttribution: true,
    });
  });

  it('falls back to manual funds when there are no contributions', () => {
    const result = buildHoldingDetailViewModel(holding, [], [], new Map());
    expect(result.funds).toBe(500);
    expect(result.totalContributions).toBe(0);
  });
});
