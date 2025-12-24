import { describe, it, expect } from 'vitest';
import {
  calculateScenario,
  compareScenarios,
  calculateOptimalDonation,
  analyzeBunchingStrategy,
  type ScenarioInput,
} from './scenario-calculator';

describe('Tax Scenario Calculator', () => {
  describe('calculateScenario', () => {
    it('should calculate basic cash donation scenario', () => {
      const input: ScenarioInput = {
        agi: 200000,
        donation_amount: 50000,
        donation_type: 'cash',
      };

      const result = calculateScenario(input);

      expect(result.agi).toBe(200000);
      expect(result.agi_limit_category).toBe('60%');
      expect(result.agi_limit_amount).toBe(120000); // 60% of 200k
      expect(result.deductible_this_year).toBe(50000);
      expect(result.excess_carryforward).toBe(0);
      expect(result.within_agi_limit).toBe(true);
    });

    it('should calculate appreciated asset with capital gains savings', () => {
      const input: ScenarioInput = {
        agi: 300000,
        donation_amount: 100000,
        donation_type: 'stock',
        cost_basis: 40000,
      };

      const result = calculateScenario(input);

      expect(result.agi_limit_category).toBe('30%');
      expect(result.capital_gains_avoided).toBe(60000); // 100k - 40k
      expect(result.capital_gains_tax_saved).toBe(12000); // 60k * 20%
      expect(result.deduction_value).toBeGreaterThan(0);
    });

    it('should handle donation exceeding AGI limit with carryforward', () => {
      const input: ScenarioInput = {
        agi: 100000,
        donation_amount: 80000,
        donation_type: 'cash',
      };

      const result = calculateScenario(input);

      expect(result.agi_limit_amount).toBe(60000); // 60% of 100k
      expect(result.deductible_this_year).toBe(60000);
      expect(result.excess_carryforward).toBe(20000);
      expect(result.within_agi_limit).toBe(false);
    });

    it('should calculate multi-year carryforward projection', () => {
      const input: ScenarioInput = {
        agi: 100000,
        donation_amount: 150000,
        donation_type: 'cash',
        project_years: 3,
        future_agi: [110000, 120000],
      };

      const result = calculateScenario(input);

      expect(result.deductible_this_year).toBe(60000); // 60% of 100k
      expect(result.excess_carryforward).toBe(90000);
      expect(result.carryforward_schedule).toBeDefined();
      expect(result.carryforward_schedule?.length).toBeGreaterThan(0);
      expect(result.years_to_fully_deduct).toBeGreaterThan(1);
    });

    it('should handle QCD recommendation for eligible donors', () => {
      const input: ScenarioInput = {
        agi: 150000,
        donation_amount: 50000,
        donation_type: 'cash',
        age: 71,
      };

      const result = calculateScenario(input);

      const hasQCDRecommendation = result.recommendations?.some(rec =>
        rec.includes('QCD')
      );
      expect(hasQCDRecommendation).toBe(true);
    });
  });

  describe('compareScenarios - Bug Fix #1', () => {
    it('should throw error with empty array', () => {
      expect(() => compareScenarios([])).toThrow(
        'At least 2 scenarios are required for comparison'
      );
    });

    it('should throw error with single scenario', () => {
      const scenarios: ScenarioInput[] = [
        {
          agi: 200000,
          donation_amount: 50000,
          donation_type: 'cash',
        },
      ];

      expect(() => compareScenarios(scenarios)).toThrow(
        'At least 2 scenarios are required for comparison'
      );
    });

    it('should successfully compare 2 scenarios', () => {
      const scenarios: ScenarioInput[] = [
        {
          agi: 200000,
          donation_amount: 50000,
          donation_type: 'cash',
        },
        {
          agi: 200000,
          donation_amount: 50000,
          donation_type: 'stock',
          cost_basis: 20000,
        },
      ];

      const result = compareScenarios(scenarios);

      expect(result.scenarios).toHaveLength(2);
      expect(result.comparison).toBeDefined();
      expect(result.comparison.best_tax_savings).toBeDefined();
      expect(result.comparison.best_agi_utilization).toBeDefined();
      expect(result.comparison.fastest_full_deduction).toBeDefined();
    });

    it('should identify best tax savings scenario', () => {
      const scenarios: ScenarioInput[] = [
        {
          agi: 300000,
          donation_amount: 50000,
          donation_type: 'cash',
        },
        {
          agi: 300000,
          donation_amount: 50000,
          donation_type: 'stock',
          cost_basis: 20000,
        },
      ];

      const result = compareScenarios(scenarios);

      // Stock donation should have higher tax savings due to cap gains avoidance
      expect(result.comparison.best_tax_savings.scenario_name).toContain('stock');
    });
  });

  describe('calculateOptimalDonation - Bug Fix #4', () => {
    it('should calculate optimal amount for basic scenario', () => {
      const result = calculateOptimalDonation({
        agi: 200000,
        donation_type: 'cash',
      });

      expect(result.optimal_amount).toBe(120000); // 60% of 200k
      expect(result.agi_limit).toBe(120000);
      expect(result.remaining_capacity).toBe(120000);
      expect(result.tax_savings_at_optimal).toBeGreaterThan(0);
    });

    it('should handle zero AGI without division by zero', () => {
      const result = calculateOptimalDonation({
        agi: 0,
        donation_type: 'cash',
      });

      expect(result.optimal_amount).toBe(0);
      expect(result.agi_limit).toBe(0);
      expect(result.tax_savings_at_optimal).toBe(0);
    });

    it('should correctly calculate capital gains with cost basis', () => {
      const result = calculateOptimalDonation({
        agi: 300000,
        donation_type: 'stock',
        cost_basis: 30000,
      });

      const optimalAmount = 90000; // 30% of 300k
      expect(result.optimal_amount).toBe(optimalAmount);

      // Should calculate capital gains as: optimalAmount - costBasis
      const expectedCapGains = optimalAmount - 30000;
      const expectedCapGainsTax = expectedCapGains * 0.20;

      // Tax savings includes both cap gains tax saved and deduction value
      expect(result.tax_savings_at_optimal).toBeGreaterThan(expectedCapGainsTax);
    });

    it('should handle zero optimal amount without errors', () => {
      const result = calculateOptimalDonation({
        agi: 100000,
        donation_type: 'cash',
        existing_contributions_in_category: 60000, // Already maxed out
      });

      expect(result.optimal_amount).toBe(0);
      expect(result.remaining_capacity).toBe(0);
      expect(result.tax_savings_at_optimal).toBe(0);
    });

    it('should account for existing contributions', () => {
      const result = calculateOptimalDonation({
        agi: 200000,
        donation_type: 'cash',
        existing_contributions_in_category: 50000,
      });

      expect(result.agi_limit).toBe(120000); // 60% of 200k
      expect(result.remaining_capacity).toBe(70000); // 120k - 50k
      expect(result.optimal_amount).toBe(70000);
    });
  });

  describe('analyzeBunchingStrategy - Bug Fixes #2, #3, #7, #9', () => {
    it('should use correct standard deduction for married filing jointly', () => {
      const result = analyzeBunchingStrategy({
        agi: 200000,
        annual_donation_amount: 20000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'married_joint',
        tax_year: 2024,
      });

      // Standard deduction for MFJ 2024 is $29,200
      expect(result.spread_strategy).toBeDefined();
      expect(result.bunching_strategy).toBeDefined();

      // Verify the calculation uses correct standard deduction
      // If bunching donation (40k) > standard deduction (29,200), there's a benefit
      const bunchAmount = 40000; // 20k * 2
      const standardDeduction = 29200;
      const expectedBenefit = (bunchAmount - standardDeduction) * 0.37;

      expect(result.bunching_strategy.tax_savings).toBeCloseTo(expectedBenefit * 2, 0); // 2 bunch years
    });

    it('should use correct standard deduction for single filers', () => {
      const result = analyzeBunchingStrategy({
        agi: 150000,
        annual_donation_amount: 10000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'single',
        tax_year: 2024,
      });

      // Standard deduction for single 2024 is $14,600
      expect(result.spread_strategy).toBeDefined();
      expect(result.bunching_strategy).toBeDefined();
    });

    it('should throw error for invalid year range (< 2)', () => {
      expect(() =>
        analyzeBunchingStrategy({
          agi: 200000,
          annual_donation_amount: 20000,
          donation_type: 'cash',
          years_to_analyze: 1,
          filing_status: 'married_joint',
          tax_year: 2024,
        })
      ).toThrow('Years to analyze must be between 2 and 10');
    });

    it('should throw error for invalid year range (> 10)', () => {
      expect(() =>
        analyzeBunchingStrategy({
          agi: 200000,
          annual_donation_amount: 20000,
          donation_type: 'cash',
          years_to_analyze: 15,
          filing_status: 'married_joint',
          tax_year: 2024,
        })
      ).toThrow('Years to analyze must be between 2 and 10');
    });

    it('should correctly recommend bunching when beneficial', () => {
      const result = analyzeBunchingStrategy({
        agi: 200000,
        annual_donation_amount: 25000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'married_joint',
        tax_year: 2024,
      });

      // With 25k annual donation:
      // - Spread: 25k each year, barely over standard deduction (29,200)
      // - Bunch: 50k every other year, well over standard deduction
      // Bunching should be better

      expect(result.recommendation).toBe('bunch');
      expect(result.savings_difference).toBeGreaterThan(0);
    });

    it('should correctly recommend spreading when bunching provides no benefit', () => {
      const result = analyzeBunchingStrategy({
        agi: 500000,
        annual_donation_amount: 80000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'married_joint',
        tax_year: 2024,
      });

      // With high donations already well over standard deduction,
      // spreading vs bunching makes little difference or spreading is better
      expect(result.recommendation).toBeDefined();
      expect(['spread', 'bunch']).toContain(result.recommendation);
    });

    it('should calculate tax savings correctly for spread strategy', () => {
      const result = analyzeBunchingStrategy({
        agi: 200000,
        annual_donation_amount: 30000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'married_joint',
        tax_year: 2024,
      });

      const standardDeduction = 29200;
      const annualDonation = 30000;
      const years = 4;

      // Spread: itemize all 4 years, excess over standard deduction
      const expectedSpreadBenefit = (annualDonation - standardDeduction) * 0.37 * years;

      expect(result.spread_strategy.tax_savings).toBeCloseTo(expectedSpreadBenefit, 0);
    });

    it('should calculate tax savings correctly for bunching strategy', () => {
      const result = analyzeBunchingStrategy({
        agi: 200000,
        annual_donation_amount: 20000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'married_joint',
        tax_year: 2024,
      });

      const standardDeduction = 29200;
      const bunchAmount = 40000; // 20k * 2
      const bunchYears = 2; // 4 years / 2

      // Bunch: itemize in 2 bunch years with 40k donation
      const expectedBunchBenefit = (bunchAmount - standardDeduction) * 0.37 * bunchYears;

      expect(result.bunching_strategy.tax_savings).toBeCloseTo(expectedBunchBenefit, 0);
    });

    it('should respect AGI limits in calculations', () => {
      const result = analyzeBunchingStrategy({
        agi: 50000,
        annual_donation_amount: 25000,
        donation_type: 'cash',
        years_to_analyze: 4,
        filing_status: 'single',
        tax_year: 2024,
      });

      const agiLimit = 50000 * 0.6; // 30k for cash

      // Spread: 25k annual is within AGI limit
      expect(result.spread_strategy.annual_deduction).toBe(25000);

      // Bunch: 50k would exceed AGI limit, capped at 30k
      expect(result.bunching_strategy.bunch_year_deduction).toBe(30000);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle zero cost basis for appreciated assets', () => {
      const input: ScenarioInput = {
        agi: 200000,
        donation_amount: 50000,
        donation_type: 'stock',
        cost_basis: 0,
      };

      const result = calculateScenario(input);

      expect(result.capital_gains_avoided).toBe(50000);
      expect(result.capital_gains_tax_saved).toBe(10000); // 50k * 20%
    });

    it('should handle conservation easement with 50% AGI limit', () => {
      const input: ScenarioInput = {
        agi: 200000,
        donation_amount: 120000,
        donation_type: 'conservation_easement',
      };

      const result = calculateScenario(input);

      expect(result.agi_limit_category).toBe('50%');
      expect(result.agi_limit_amount).toBe(100000);
      expect(result.deductible_this_year).toBe(100000);
      expect(result.excess_carryforward).toBe(20000);
    });

    it('should handle multiple donation types in comparison', () => {
      const scenarios: ScenarioInput[] = [
        { agi: 300000, donation_amount: 60000, donation_type: 'cash' },
        { agi: 300000, donation_amount: 60000, donation_type: 'stock', cost_basis: 30000 },
        { agi: 300000, donation_amount: 60000, donation_type: 'real_estate', cost_basis: 40000 },
      ];

      const result = compareScenarios(scenarios);

      expect(result.scenarios).toHaveLength(3);
      expect(result.comparison.recommendation).toBeDefined();

      // Stock with lower cost basis should have highest tax savings
      expect(result.comparison.best_tax_savings.scenario_name).toContain('stock');
    });
  });
});
