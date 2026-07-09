// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { calculatePayout } from '@/lib/compliance/payout';

describe('calculatePayout', () => {
  it('uses the Part XIII asset-base formula before subtracting excise tax', () => {
    const payout = calculatePayout(
      {
        avg_fair_market_value: '1000000',
        fair_market_value_assets: '1200000',
        exempt_use_assets: '100000',
        acquisition_indebtedness: '50000',
        net_investment_income: '20000',
        excise_tax_rate: '1.39',
      },
      30000
    );

    expect(payout.assetBase).toBe(1000000);
    expect(payout.netValueNonCharitable).toBe(850000);
    expect(payout.minimumInvestmentReturn).toBe(42500);
    expect(payout.exciseTaxAmount).toBe(278);
    expect(payout.requiredPayout).toBe(42222);
    expect(payout.actualDistributions).toBe(30000);
    expect(payout.surplusOrDeficit).toBe(-12222);
  });

  it('honors filed-form overrides for required and actual payout', () => {
    const payout = calculatePayout(
      {
        fair_market_value_assets: '500000',
        required_payout: '18000',
        actual_payout: '19000',
      },
      12000
    );

    expect(payout.requiredPayout).toBe(18000);
    expect(payout.actualDistributions).toBe(19000);
    expect(payout.surplusOrDeficit).toBe(1000);
    expect(payout.pctDistributed).toBe(105.56);
  });
});
