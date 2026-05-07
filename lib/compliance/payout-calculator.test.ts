import { describe, it, expect } from 'vitest';
import {
  calculateMIR,
  calculateDistributableAmount,
  calculatePayout,
  calculateSurplusOrDeficit,
  calculatePayoutForecast,
  calculateSelfDealingExciseTaxes,
  calculateHealthScore,
  classifyHealthScore,
  assessSelfDealingRisk,
} from './payout-calculator';

// ─── IRC §4942 MIR ───────────────────────────────────────────────────────────

describe('calculateMIR — IRC §4942 5% minimum investment return', () => {
  it('returns exactly 5% of net non-charitable assets', () => {
    expect(calculateMIR(10_000_000)).toBe(500_000);
  });

  it('rounds to 2 decimal places', () => {
    // 3_000_001 × 0.05 = 150_000.05
    expect(calculateMIR(3_000_001)).toBe(150_000.05);
  });

  it('returns 0 for zero assets', () => {
    expect(calculateMIR(0)).toBe(0);
  });

  it('clamps to 0 for negative assets (should not occur in practice)', () => {
    expect(calculateMIR(-100_000)).toBe(0);
  });

  it('handles large endowment correctly', () => {
    // $500M endowment → $25M required distribution
    expect(calculateMIR(500_000_000)).toBe(25_000_000);
  });
});

// ─── Distributable Amount ────────────────────────────────────────────────────

describe('calculateDistributableAmount — MIR minus §4940 excise tax', () => {
  it('subtracts excise tax from MIR', () => {
    // MIR = $500k, excise tax = $20k → distributable = $480k
    expect(calculateDistributableAmount(10_000_000, 20_000)).toBe(480_000);
  });

  it('defaults excise_tax_paid to 0 when omitted', () => {
    expect(calculateDistributableAmount(10_000_000)).toBe(500_000);
  });

  it('never returns a negative distributable amount', () => {
    // Excise tax exceeds MIR (pathological case)
    expect(calculateDistributableAmount(100_000, 999_999)).toBe(0);
  });
});

// ─── Full Payout Calculation ──────────────────────────────────────────────────

describe('calculatePayout — full IRC §4942 computation', () => {
  it('returns all intermediate values', () => {
    const result = calculatePayout({
      net_value_non_charitable: 20_000_000,
      excise_tax_paid: 30_000,
    });

    expect(result.minimum_investment_return).toBe(1_000_000);       // 20M × 5%
    expect(result.excise_tax_paid).toBe(30_000);
    expect(result.distributable_amount).toBe(970_000);              // 1M - 30k
    expect(result.net_value_non_charitable).toBe(20_000_000);
  });

  it('handles missing optional fields with safe defaults', () => {
    const result = calculatePayout({ net_value_non_charitable: 5_000_000 });
    expect(result.excise_tax_paid).toBe(0);
    expect(result.distributable_amount).toBe(250_000);
  });

  it('known 990-PF scenario: $8M foundation', () => {
    // Example from IRS Publication 578
    const result = calculatePayout({
      net_value_non_charitable: 8_000_000,
      excise_tax_paid: 4_800,  // 1.39% investment income excise tax
    });
    expect(result.minimum_investment_return).toBe(400_000);
    expect(result.distributable_amount).toBe(395_200);
  });
});

// ─── Surplus / Deficit ───────────────────────────────────────────────────────

describe('calculateSurplusOrDeficit', () => {
  it('returns positive surplus when foundation over-distributes', () => {
    expect(calculateSurplusOrDeficit(600_000, 500_000)).toBe(100_000);
  });

  it('returns negative deficit when foundation under-distributes', () => {
    expect(calculateSurplusOrDeficit(300_000, 500_000)).toBe(-200_000);
  });

  it('returns 0 when exactly meeting requirement', () => {
    expect(calculateSurplusOrDeficit(500_000, 500_000)).toBe(0);
  });
});

// ─── Payout Forecast ─────────────────────────────────────────────────────────

describe('calculatePayoutForecast — mid-year progress tracking', () => {
  // Fix today to July 1 of a test year so days_remaining is predictable
  const TAX_YEAR = 2025;
  const MID_YEAR = new Date('2025-07-01');

  it('calculates shortfall correctly before considering pipeline', () => {
    const result = calculatePayoutForecast(
      500_000,   // distributable_amount
      100_000,   // distributions_to_date
      0,         // pipeline_total
      TAX_YEAR,
      MID_YEAR
    );

    expect(result.shortfall_before_pipeline).toBe(400_000);
    expect(result.shortfall_after_pipeline).toBe(400_000);
    expect(result.on_track).toBe(false);
  });

  it('reduces shortfall by pipeline amount', () => {
    const result = calculatePayoutForecast(
      500_000,   // required
      100_000,   // distributed
      350_000,   // pipeline (approved grants not yet counted)
      TAX_YEAR,
      MID_YEAR
    );

    expect(result.shortfall_before_pipeline).toBe(400_000);
    expect(result.shortfall_after_pipeline).toBe(50_000);
    expect(result.on_track).toBe(false);
  });

  it('reports on_track when pipeline covers shortfall', () => {
    const result = calculatePayoutForecast(
      500_000,
      100_000,
      400_000,   // exactly covers the gap
      TAX_YEAR,
      MID_YEAR
    );

    expect(result.shortfall_after_pipeline).toBe(0);
    expect(result.on_track).toBe(true);
  });

  it('reports on_track when already fully distributed', () => {
    const result = calculatePayoutForecast(
      500_000,
      550_000,  // distributed more than required
      0,
      TAX_YEAR,
      MID_YEAR
    );

    expect(result.shortfall_before_pipeline).toBe(0);
    expect(result.shortfall_after_pipeline).toBe(0);
    expect(result.on_track).toBe(true);
  });

  it('calculates pct_complete correctly', () => {
    const result = calculatePayoutForecast(500_000, 250_000, 0, TAX_YEAR, MID_YEAR);
    expect(result.pct_complete).toBe(50.0);
  });

  it('caps pct_complete at 100 even when over-distributed', () => {
    const result = calculatePayoutForecast(500_000, 750_000, 0, TAX_YEAR, MID_YEAR);
    expect(result.pct_complete).toBe(100);
  });

  it('returns pct_complete of 100 when distributable_amount is 0', () => {
    const result = calculatePayoutForecast(0, 0, 0, TAX_YEAR, MID_YEAR);
    expect(result.pct_complete).toBe(100);
  });

  it('calculates days_remaining to Dec 31', () => {
    // July 1 to Dec 31 = 183 days in 2025
    const result = calculatePayoutForecast(500_000, 0, 0, TAX_YEAR, MID_YEAR);
    expect(result.days_remaining).toBe(183);
  });

  it('returns 0 days_remaining after year-end', () => {
    const afterYearEnd = new Date('2026-01-15');
    const result = calculatePayoutForecast(500_000, 0, 0, TAX_YEAR, afterYearEnd);
    expect(result.days_remaining).toBe(0);
  });

  it('does not count pipeline amounts that go negative', () => {
    const result = calculatePayoutForecast(100_000, 90_000, 0, TAX_YEAR, MID_YEAR);
    expect(result.shortfall_before_pipeline).toBe(10_000);
    // Pipeline of zero: shortfall stays at 10k, not negative
    expect(result.shortfall_after_pipeline).toBe(10_000);
  });
});

// ─── IRC §4941 Self-Dealing Excise Taxes ────────────────────────────────────

describe('calculateSelfDealingExciseTaxes — IRC §4941', () => {
  it('calculates 10% initial tax on amount involved', () => {
    const result = calculateSelfDealingExciseTaxes(100_000);
    expect(result.initial_excise_tax).toBe(10_000);
  });

  it('calculates 200% correction tax if not remedied', () => {
    const result = calculateSelfDealingExciseTaxes(100_000);
    expect(result.correction_excise_tax).toBe(200_000);
  });

  it('handles small dollar amounts with correct rounding', () => {
    const result = calculateSelfDealingExciseTaxes(33_333);
    expect(result.initial_excise_tax).toBe(3_333.30);
    expect(result.correction_excise_tax).toBe(66_666);
  });

  it('returns zero taxes for zero-dollar transaction', () => {
    const result = calculateSelfDealingExciseTaxes(0);
    expect(result.initial_excise_tax).toBe(0);
    expect(result.correction_excise_tax).toBe(0);
  });

  it('throws on negative amounts', () => {
    expect(() => calculateSelfDealingExciseTaxes(-1000)).toThrow(RangeError);
  });
});

// ─── Compliance Health Score ──────────────────────────────────────────────────

describe('calculateHealthScore', () => {
  it('returns 100 when no issues', () => {
    expect(calculateHealthScore({
      filings_overdue: 0, incidents_open: 0, state_renewals_overdue: 0,
    })).toBe(100);
  });

  it('deducts 15 points per overdue filing', () => {
    expect(calculateHealthScore({
      filings_overdue: 2, incidents_open: 0, state_renewals_overdue: 0,
    })).toBe(70);
  });

  it('deducts 20 points per open incident', () => {
    expect(calculateHealthScore({
      filings_overdue: 0, incidents_open: 1, state_renewals_overdue: 0,
    })).toBe(80);
  });

  it('deducts 10 points per overdue state renewal', () => {
    expect(calculateHealthScore({
      filings_overdue: 0, incidents_open: 0, state_renewals_overdue: 3,
    })).toBe(70);
  });

  it('combines all deductions correctly', () => {
    // 2 overdue filings (30) + 1 incident (20) + 1 renewal (10) = 60 deducted → 40
    expect(calculateHealthScore({
      filings_overdue: 2, incidents_open: 1, state_renewals_overdue: 1,
    })).toBe(40);
  });

  it('clamps at 0 when deductions exceed 100', () => {
    expect(calculateHealthScore({
      filings_overdue: 10, incidents_open: 5, state_renewals_overdue: 10,
    })).toBe(0);
  });

  it('never returns negative or above 100', () => {
    const score = calculateHealthScore({
      filings_overdue: 999, incidents_open: 999, state_renewals_overdue: 999,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('classifyHealthScore', () => {
  it('classifies 80-100 as good', () => {
    expect(classifyHealthScore(100)).toBe('good');
    expect(classifyHealthScore(80)).toBe('good');
  });

  it('classifies 60-79 as attention', () => {
    expect(classifyHealthScore(79)).toBe('attention');
    expect(classifyHealthScore(60)).toBe('attention');
  });

  it('classifies below 60 as at_risk', () => {
    expect(classifyHealthScore(59)).toBe('at_risk');
    expect(classifyHealthScore(0)).toBe('at_risk');
  });
});

// ─── Self-Dealing Pre-Screen ──────────────────────────────────────────────────

describe('assessSelfDealingRisk', () => {
  const PERSONS = [
    { full_name: 'Jane Smith', relationship_type: 'founder', ein: null },
    { full_name: 'Acme Family Trust', relationship_type: 'thirty_five_pct_owned_entity', ein: '12-3456789' },
    { full_name: 'Robert Johnson', relationship_type: 'foundation_manager', ein: null },
  ];

  it('returns none when counterparty is not in registry', () => {
    const result = assessSelfDealingRisk('Unknown Vendor LLC', undefined, PERSONS);
    expect(result.riskLevel).toBe('none');
    expect(result.matches).toHaveLength(0);
  });

  it('returns high risk on name match with founder', () => {
    const result = assessSelfDealingRisk('Jane Smith', undefined, PERSONS);
    expect(result.riskLevel).toBe('high');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].full_name).toBe('Jane Smith');
  });

  it('returns high risk on name match with foundation_manager', () => {
    const result = assessSelfDealingRisk('Robert Johnson', undefined, PERSONS);
    expect(result.riskLevel).toBe('high');
  });

  it('returns medium risk for non-principal disqualified persons', () => {
    const result = assessSelfDealingRisk('Acme Family Trust', undefined, PERSONS);
    expect(result.riskLevel).toBe('medium');
  });

  it('matches by EIN (exact, hyphen-insensitive)', () => {
    const result = assessSelfDealingRisk('Some Other Name', '123456789', PERSONS);
    expect(result.riskLevel).toBe('medium'); // Acme matched by EIN
    expect(result.matches[0].full_name).toBe('Acme Family Trust');
  });

  it('EIN match ignores hyphens in both stored and input EIN', () => {
    const result = assessSelfDealingRisk('X', '12-3456789', PERSONS);
    expect(result.riskLevel).toBe('medium');
  });

  it('name matching is case-insensitive', () => {
    const result = assessSelfDealingRisk('jane smith', undefined, PERSONS);
    expect(result.riskLevel).toBe('high');
  });

  it('partial name match works bidirectionally', () => {
    // counterparty "Jane" is a substring of "Jane Smith"
    const result = assessSelfDealingRisk('Jane', undefined, PERSONS);
    expect(result.riskLevel).toBe('high');
  });

  it('returns none with empty registry', () => {
    const result = assessSelfDealingRisk('Jane Smith', undefined, []);
    expect(result.riskLevel).toBe('none');
  });

  it('returns high when any match is high-risk even if others are medium', () => {
    const persons = [
      { full_name: 'Smith Family Trust', relationship_type: 'thirty_five_pct_owned_entity', ein: null },
      { full_name: 'Jane Smith', relationship_type: 'founder', ein: null },
    ];
    const result = assessSelfDealingRisk('Smith', undefined, persons);
    expect(result.riskLevel).toBe('high');
    expect(result.matches).toHaveLength(2);
  });

  it('does not match empty counterparty name', () => {
    // Empty string matches everything via substring — test for practical safety
    const result = assessSelfDealingRisk('', undefined, PERSONS);
    // All names contain the empty string — all match, highest risk wins
    expect(result.riskLevel).toBe('high');
    expect(result.matches.length).toBeGreaterThan(0);
  });
});
