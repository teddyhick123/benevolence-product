/**
 * Tax Scenario Modeling & "What-If" Analysis
 *
 * Enables users to explore hypothetical donation scenarios:
 * - Compare different donation amounts
 * - Evaluate timing (this year vs. next year)
 * - Assess asset types (cash vs. stock vs. PE)
 * - Optimize for tax savings
 * - Project multi-year carryforwards
 */

import { getStandardDeduction } from './constants';
import type { FilingStatus } from '@/lib/schemas/tax';

export interface ScenarioInput {
  // Donor information
  agi: number;
  filing_status?: string;
  age?: number;

  // Hypothetical donation
  donation_amount: number;
  donation_type: 'cash' | 'stock' | 'real_estate' | 'pe_vc' | 'other_property' | 'conservation_easement';
  cost_basis?: number; // For appreciated assets
  agi_limit_percentage?: number; // Override auto-detection

  // Existing contributions this year
  existing_contributions_60_pct?: number;
  existing_contributions_50_pct?: number;
  existing_contributions_30_pct?: number;
  existing_contributions_20_pct?: number;

  // Multi-year analysis
  project_years?: number; // Default 1
  future_agi?: number[]; // AGI for next N years
}

export interface ScenarioResult {
  // Input summary
  scenario_name: string;
  donation_amount: number;
  donation_type: string;

  // AGI analysis
  agi: number;
  agi_limit_category: '60%' | '50%' | '30%' | '20%';
  agi_limit_amount: number;

  // Current year deduction
  deductible_this_year: number;
  excess_carryforward: number;
  within_agi_limit: boolean;
  utilization_percentage: number;

  // Tax savings
  capital_gains_avoided?: number;
  capital_gains_tax_saved?: number; // At 20% LTCG rate
  deduction_value: number; // At 37% marginal rate
  total_tax_savings: number;

  // Multi-year projection
  carryforward_schedule?: CarryforwardProjection[];
  total_deductible_over_years?: number;
  years_to_fully_deduct?: number;

  // Optimization insights
  is_optimal_timing?: boolean;
  recommendations?: string[];
}

export interface CarryforwardProjection {
  year: number;
  agi: number;
  agi_limit: number;
  carryforward_available: number;
  carryforward_used: number;
  remaining_after_year: number;
}

/**
 * Calculate tax impact for a single scenario
 */
export function calculateScenario(input: ScenarioInput): ScenarioResult {
  const {
    agi,
    donation_amount,
    donation_type,
    cost_basis = 0,
    project_years = 1,
    future_agi = [],
  } = input;

  // Determine AGI limit category
  const agiLimitPercentage = input.agi_limit_percentage || getAGILimitForType(donation_type);
  const agiLimitCategory = `${agiLimitPercentage}%` as '60%' | '50%' | '30%' | '20%';
  const agiLimitAmount = agi * (agiLimitPercentage / 100);

  // Calculate deductible amount (capped at AGI limit)
  const deductibleThisYear = Math.min(donation_amount, agiLimitAmount);
  const excessCarryforward = Math.max(donation_amount - agiLimitAmount, 0);
  const withinAGILimit = donation_amount <= agiLimitAmount;
  const utilizationPercentage = (donation_amount / agiLimitAmount) * 100;

  // Calculate tax savings
  const isAppreciatedAsset = ['stock', 'real_estate', 'pe_vc', 'other_property'].includes(donation_type);
  const capitalGainsAvoided = isAppreciatedAsset && cost_basis >= 0
    ? Math.max(donation_amount - cost_basis, 0)
    : 0;
  const capitalGainsTaxSaved = capitalGainsAvoided * 0.20; // 20% LTCG rate

  const deductionValue = deductibleThisYear * 0.37; // 37% marginal rate assumption
  const totalTaxSavings = capitalGainsTaxSaved + deductionValue;

  // Multi-year carryforward projection
  let carryforwardSchedule: CarryforwardProjection[] = [];
  let totalDeductibleOverYears = deductibleThisYear;
  let yearsToFullyDeduct = 1;

  if (excessCarryforward > 0 && project_years > 1) {
    let remainingCarryforward = excessCarryforward;
    const carryforwardYears = donation_type === 'conservation_easement' ? 15 : 5;

    for (let i = 1; i <= Math.min(project_years - 1, carryforwardYears); i++) {
      const yearAGI = future_agi[i - 1] || agi; // Use future AGI or default to current
      const yearLimit = yearAGI * (agiLimitPercentage / 100);
      const carryforwardUsed = Math.min(remainingCarryforward, yearLimit);

      remainingCarryforward -= carryforwardUsed;
      totalDeductibleOverYears += carryforwardUsed;

      if (remainingCarryforward <= 0) {
        yearsToFullyDeduct = i + 1;
      }

      carryforwardSchedule.push({
        year: new Date().getFullYear() + i,
        agi: yearAGI,
        agi_limit: yearLimit,
        carryforward_available: remainingCarryforward + carryforwardUsed,
        carryforward_used: carryforwardUsed,
        remaining_after_year: remainingCarryforward,
      });

      if (remainingCarryforward <= 0) break;
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (!withinAGILimit) {
    recommendations.push(
      `💡 Donation exceeds ${agiLimitPercentage}% AGI limit by $${excessCarryforward.toLocaleString()}. ` +
      `Consider splitting across multiple years or increasing AGI.`
    );
  }

  if (utilizationPercentage > 90 && utilizationPercentage <= 100) {
    recommendations.push(
      `✅ Excellent AGI utilization (${Math.round(utilizationPercentage)}%). ` +
      `You're maximizing your deduction without carryforward.`
    );
  }

  if (excessCarryforward > 0 && yearsToFullyDeduct > 3) {
    recommendations.push(
      `⚠️ Carryforward will take ${yearsToFullyDeduct} years to fully deduct. ` +
      `Consider spreading donations over multiple years.`
    );
  }

  if (isAppreciatedAsset && capitalGainsAvoided > 0) {
    recommendations.push(
      `📈 By donating appreciated assets, you avoid $${capitalGainsAvoided.toLocaleString()} ` +
      `in capital gains (saves $${capitalGainsTaxSaved.toLocaleString()} in taxes).`
    );
  }

  if (input.age && input.age >= 70.5 && donation_amount <= 100000) {
    recommendations.push(
      `💰 You're QCD eligible! Consider using a Qualified Charitable Distribution ` +
      `to exclude up to $100,000 from income (better than a deduction).`
    );
  }

  return {
    scenario_name: `${donation_type} donation of $${donation_amount.toLocaleString()}`,
    donation_amount,
    donation_type,
    agi,
    agi_limit_category: agiLimitCategory,
    agi_limit_amount: agiLimitAmount,
    deductible_this_year: deductibleThisYear,
    excess_carryforward: excessCarryforward,
    within_agi_limit: withinAGILimit,
    utilization_percentage: utilizationPercentage,
    capital_gains_avoided: capitalGainsAvoided > 0 ? capitalGainsAvoided : undefined,
    capital_gains_tax_saved: capitalGainsTaxSaved > 0 ? capitalGainsTaxSaved : undefined,
    deduction_value: deductionValue,
    total_tax_savings: totalTaxSavings,
    carryforward_schedule: carryforwardSchedule.length > 0 ? carryforwardSchedule : undefined,
    total_deductible_over_years: totalDeductibleOverYears,
    years_to_fully_deduct: yearsToFullyDeduct,
    recommendations,
  };
}

/**
 * Compare multiple scenarios side-by-side
 */
export function compareScenarios(scenarios: ScenarioInput[]): {
  scenarios: ScenarioResult[];
  comparison: ScenarioComparison;
} {
  // Bug fix #1: Validate that we have at least 2 scenarios to compare
  if (!scenarios || scenarios.length < 2) {
    throw new Error('At least 2 scenarios are required for comparison');
  }

  const results = scenarios.map(calculateScenario);

  const bestTaxSavings = results.reduce((best, current) =>
    current.total_tax_savings > best.total_tax_savings ? current : best
  );

  const bestAGIUtilization = results.reduce((best, current) => {
    const currentDiff = Math.abs(100 - current.utilization_percentage);
    const bestDiff = Math.abs(100 - best.utilization_percentage);
    return currentDiff < bestDiff ? current : best;
  });

  const fastestDeduction = results.reduce((fastest, current) =>
    (current.years_to_fully_deduct ?? 1) < (fastest.years_to_fully_deduct ?? 1) ? current : fastest
  );

  return {
    scenarios: results,
    comparison: {
      best_tax_savings: {
        scenario_name: bestTaxSavings.scenario_name,
        savings: bestTaxSavings.total_tax_savings,
      },
      best_agi_utilization: {
        scenario_name: bestAGIUtilization.scenario_name,
        utilization: bestAGIUtilization.utilization_percentage,
      },
      fastest_full_deduction: {
        scenario_name: fastestDeduction.scenario_name,
        years: fastestDeduction.years_to_fully_deduct ?? 1,
      },
      recommendation: generateComparisonRecommendation(results),
    },
  };
}

interface ScenarioComparison {
  best_tax_savings: {
    scenario_name: string;
    savings: number;
  };
  best_agi_utilization: {
    scenario_name: string;
    utilization: number;
  };
  fastest_full_deduction: {
    scenario_name: string;
    years: number;
  };
  recommendation: string;
}

/**
 * Get AGI limit percentage for donation type
 */
function getAGILimitForType(donationType: string): number {
  switch (donationType) {
    case 'cash':
      return 60; // Cash to public charity
    case 'conservation_easement':
      return 50; // Conservation easements
    case 'stock':
    case 'real_estate':
    case 'pe_vc':
    case 'other_property':
      return 30; // Appreciated property to public charity
    default:
      return 30;
  }
}

/**
 * Generate recommendation based on scenario comparison
 */
function generateComparisonRecommendation(scenarios: ScenarioResult[]): string {
  if (scenarios.length === 0) return 'Add scenarios to compare.';
  if (scenarios.length === 1) return scenarios[0].recommendations?.[0] || 'Single scenario analyzed.';

  // Find scenario that balances tax savings and AGI utilization
  const balanced = scenarios.reduce((best, current) => {
    const currentScore = current.total_tax_savings * (1 - Math.abs(100 - current.utilization_percentage) / 100);
    const bestScore = best.total_tax_savings * (1 - Math.abs(100 - best.utilization_percentage) / 100);
    return currentScore > bestScore ? current : best;
  });

  return `Recommended: ${balanced.scenario_name} - ` +
    `Balances tax savings ($${Math.round(balanced.total_tax_savings).toLocaleString()}) ` +
    `with ${Math.round(balanced.utilization_percentage)}% AGI utilization.`;
}

/**
 * Calculate optimal donation amount to maximize current year deduction
 */
export function calculateOptimalDonation(input: {
  agi: number;
  donation_type: string;
  cost_basis?: number;
  existing_contributions_in_category?: number;
}): {
  optimal_amount: number;
  agi_limit: number;
  remaining_capacity: number;
  tax_savings_at_optimal: number;
} {
  const agiLimitPercentage = getAGILimitForType(input.donation_type);
  const agiLimit = input.agi * (agiLimitPercentage / 100);
  const existingContributions = input.existing_contributions_in_category || 0;
  const remainingCapacity = Math.max(agiLimit - existingContributions, 0);

  const optimalAmount = remainingCapacity;

  // Bug fix #4: Fixed cost basis calculation and added zero-check protection
  const isAppreciatedAsset = ['stock', 'real_estate', 'pe_vc', 'other_property'].includes(input.donation_type);
  const costBasis = input.cost_basis || 0;
  const capitalGainsAvoided = isAppreciatedAsset && costBasis > 0 && optimalAmount > 0
    ? Math.max(optimalAmount - costBasis, 0)
    : 0;
  const capitalGainsTaxSaved = capitalGainsAvoided * 0.20; // 20% LTCG rate
  const deductionValue = optimalAmount * 0.37;
  const taxSavingsAtOptimal = capitalGainsTaxSaved + deductionValue;

  return {
    optimal_amount: optimalAmount,
    agi_limit: agiLimit,
    remaining_capacity: remainingCapacity,
    tax_savings_at_optimal: taxSavingsAtOptimal,
  };
}

/**
 * Bunching strategy analysis: Should user bunch donations in one year or spread them?
 */
export function analyzeBunchingStrategy(input: {
  agi: number;
  annual_donation_amount: number;
  donation_type: string;
  years_to_analyze: number;
  filing_status?: FilingStatus; // Bug fix #3: Added filing status parameter
  tax_year?: number; // Bug fix #3: Added tax year parameter
}): {
  spread_strategy: {
    annual_deduction: number;
    total_deduction_over_years: number;
    tax_savings: number;
  };
  bunching_strategy: {
    bunch_year_deduction: number;
    off_year_deduction: number;
    total_deduction_over_years: number;
    tax_savings: number;
  };
  recommendation: 'spread' | 'bunch';
  savings_difference: number;
} {
  const { agi, annual_donation_amount, donation_type, years_to_analyze, filing_status = 'married_joint', tax_year = new Date().getFullYear() } = input;

  // Bug fix #7: Validate year range (2-10 years is reasonable)
  if (years_to_analyze < 2 || years_to_analyze > 10) {
    throw new Error('Years to analyze must be between 2 and 10');
  }

  const agiLimitPercentage = getAGILimitForType(donation_type);
  const agiLimit = agi * (agiLimitPercentage / 100);

  // Bug fix #2: Use getStandardDeduction instead of hardcoded value
  const standardDeduction = getStandardDeduction(tax_year, filing_status);

  // Spread strategy: Donate same amount each year
  const spreadAnnualDeduction = Math.min(annual_donation_amount, agiLimit);
  const spreadTotalDeduction = spreadAnnualDeduction * years_to_analyze;

  // Bug fix #9: Fixed tax calculation logic for spread strategy
  // In spread years, donor itemizes if donation > standard deduction
  // Tax benefit is the marginal tax savings from itemizing vs. standard deduction
  const spreadYearsItemizing = spreadAnnualDeduction > standardDeduction ? years_to_analyze : 0;
  const spreadItemizingBenefit = spreadYearsItemizing > 0
    ? Math.max(spreadAnnualDeduction - standardDeduction, 0) * 0.37 * years_to_analyze
    : 0;
  const spreadTaxSavings = spreadItemizingBenefit;

  // Bunching strategy: Donate 2x every other year
  const bunchAmount = annual_donation_amount * 2;
  const bunchYears = Math.ceil(years_to_analyze / 2);
  const offYears = years_to_analyze - bunchYears;
  const bunchYearDeduction = Math.min(bunchAmount, agiLimit);
  const offYearDeduction = 0; // Use standard deduction in off years
  const bunchTotalDeduction = bunchYearDeduction * bunchYears;

  // Bug fix #9: Fixed bunching tax calculation logic
  // In bunch years: itemize with larger deduction, save on marginal taxes
  // In off years: use standard deduction (no additional benefit)
  // The benefit is the excess deduction above standard deduction in bunch years
  const bunchItemizingBenefit = Math.max(bunchYearDeduction - standardDeduction, 0) * 0.37;
  const bunchTaxSavings = bunchItemizingBenefit * bunchYears;

  const recommendation = bunchTaxSavings > spreadTaxSavings ? 'bunch' : 'spread';
  const savingsDifference = Math.abs(bunchTaxSavings - spreadTaxSavings);

  return {
    spread_strategy: {
      annual_deduction: spreadAnnualDeduction,
      total_deduction_over_years: spreadTotalDeduction,
      tax_savings: spreadTaxSavings,
    },
    bunching_strategy: {
      bunch_year_deduction: bunchYearDeduction,
      off_year_deduction: offYearDeduction,
      total_deduction_over_years: bunchTotalDeduction,
      tax_savings: bunchTaxSavings,
    },
    recommendation,
    savings_difference: savingsDifference,
  };
}
