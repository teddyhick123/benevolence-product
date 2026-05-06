/**
 * Tax Optimization Engine
 *
 * AI-powered donation strategy optimizer that:
 * - Analyzes current tax situation
 * - Evaluates portfolio holdings
 * - Recommends optimal donation strategies
 * - Projects multi-year tax impact
 */

import { calculateScenario, compareScenarios, analyzeBunchingStrategy, type ScenarioInput } from './scenario-calculator';
import { getQCDLimit, getStandardDeduction } from './constants';

export interface PortfolioHolding {
  id: string;
  name: string;
  asset_type: string;
  funds_allocated: number;
  cost_basis?: number;
  fmv?: number;
  acquisition_date?: string;
}

export interface TaxSituation {
  agi: number;
  age?: number;
  filing_status?: string;
  existing_contributions_60_pct: number;
  existing_contributions_50_pct: number;
  existing_contributions_30_pct: number;
  existing_contributions_20_pct: number;
  projected_agi_next_year?: number;
}

export interface OptimizationInput {
  tax_situation: TaxSituation;
  holdings: PortfolioHolding[];
  donation_goal?: number; // Total amount user wants to donate
  time_horizon?: number; // Years to optimize over (default 1)
  preferences?: {
    minimize_carryforward?: boolean;
    maximize_tax_savings?: boolean;
    prefer_bunching?: boolean;
  };
}

export interface OptimizationRecommendation {
  rank: number;
  strategy_name: string;
  description: string;
  confidence_score: number; // 0-100
  tax_savings: number;
  recommendations: DonationRecommendation[];
  multi_year_projection?: MultiYearProjection;
  rationale: string[];
  warnings?: string[];
}

export interface DonationRecommendation {
  holding_id: string;
  holding_name: string;
  amount: number;
  timing: 'now' | 'next_year' | 'year_2' | 'year_3';
  reason: string;
  tax_impact: {
    deductible: number;
    carryforward: number;
    capital_gains_avoided: number;
    total_tax_savings: number;
  };
}

export interface MultiYearProjection {
  year_1: YearProjection;
  year_2?: YearProjection;
  year_3?: YearProjection;
  [key: string]: YearProjection | undefined;
}

export interface YearProjection {
  year: number;
  donations: number;
  deductible: number;
  carryforward_used: number;
  carryforward_generated: number;
  tax_savings: number;
}

function capGainsRate(holding: PortfolioHolding): number {
  if (!holding.acquisition_date) return 0.20;
  const held = Date.now() - new Date(holding.acquisition_date).getTime();
  return held < 365 * 24 * 60 * 60 * 1000 ? 0.37 : 0.20;
}

/**
 * Main optimization function
 */
export function optimizeDonationStrategy(input: OptimizationInput): OptimizationRecommendation[] {
  const { tax_situation, holdings, donation_goal, time_horizon = 1, preferences = {} } = input;

  const strategies: OptimizationRecommendation[] = [];

  // Strategy 1: Donate Most Appreciated Assets First
  const appreciationStrategy = optimizeByAppreciation(tax_situation, holdings, donation_goal);
  if (appreciationStrategy) {
    strategies.push(appreciationStrategy);
  }

  // Strategy 2: Maximize Current Year Deduction (No Carryforward)
  const maxDeductionStrategy = maximizeCurrentYearDeduction(tax_situation, holdings);
  if (maxDeductionStrategy) {
    strategies.push(maxDeductionStrategy);
  }

  // Strategy 3: Spread Donations Over Multiple Years
  if (time_horizon > 1 && donation_goal) {
    const spreadStrategy = optimizeSpreadStrategy(tax_situation, holdings, donation_goal, time_horizon);
    if (spreadStrategy) {
      strategies.push(spreadStrategy);
    }
  }

  // Strategy 4: Bunching Strategy
  if (time_horizon >= 2 && donation_goal) {
    const bunchingStrategy = optimizeBunchingStrategy(tax_situation, holdings, donation_goal, time_horizon);
    if (bunchingStrategy) {
      strategies.push(bunchingStrategy);
    }
  }

  // Strategy 5: QCD Optimization (if eligible)
  if (tax_situation.age && tax_situation.age >= 70.5) {
    const qcdStrategy = optimizeQCDStrategy(tax_situation, holdings);
    if (qcdStrategy) {
      strategies.push(qcdStrategy);
    }
  }

  // Sort strategies by tax savings (descending)
  strategies.sort((a, b) => b.tax_savings - a.tax_savings);

  // Assign ranks
  strategies.forEach((strategy, index) => {
    strategy.rank = index + 1;
  });

  return strategies;
}

/**
 * Strategy 1: Donate most appreciated assets first to maximize capital gains savings
 */
function optimizeByAppreciation(
  taxSituation: TaxSituation,
  holdings: PortfolioHolding[],
  donationGoal?: number
): OptimizationRecommendation | null {
  // Filter holdings with appreciation data
  const appreciatedHoldings = holdings
    .filter(h => h.cost_basis && h.fmv && h.fmv > h.cost_basis)
    .map(h => ({
      ...h,
      appreciation: (h.fmv! - h.cost_basis!) / h.cost_basis!,
      gain: h.fmv! - h.cost_basis!,
    }))
    .sort((a, b) => b.appreciation - a.appreciation); // Highest appreciation first

  if (appreciatedHoldings.length === 0) {
    return null;
  }

  const agiLimit30Pct = taxSituation.agi * 0.30;
  const remainingCapacity = agiLimit30Pct - taxSituation.existing_contributions_30_pct;

  if (remainingCapacity <= 0) {
    return null;
  }

  const recommendations: DonationRecommendation[] = [];
  let totalAmount = 0;
  let totalTaxSavings = 0;
  let totalCapGains = 0;
  let totalCapGainsTaxSaved = 0;

  const targetAmount = Math.min(donationGoal || remainingCapacity, remainingCapacity);

  for (const holding of appreciatedHoldings) {
    if (totalAmount >= targetAmount) break;

    const amountToDonate = Math.min(holding.fmv!, targetAmount - totalAmount);
    const proportionalCostBasis = (holding.cost_basis! / holding.fmv!) * amountToDonate;
    const capitalGain = amountToDonate - proportionalCostBasis;
    const capitalGainsTaxSaved = capitalGain * capGainsRate(holding);
    const deductionValue = amountToDonate * 0.37;
    const taxSavings = capitalGainsTaxSaved + deductionValue;

    recommendations.push({
      holding_id: holding.id,
      holding_name: holding.name,
      amount: amountToDonate,
      timing: 'now',
      reason: `${Math.round(holding.appreciation * 100)}% appreciation - save $${Math.round(capitalGainsTaxSaved).toLocaleString()} in capital gains tax`,
      tax_impact: {
        deductible: amountToDonate,
        carryforward: 0,
        capital_gains_avoided: capitalGain,
        total_tax_savings: taxSavings,
      },
    });

    totalAmount += amountToDonate;
    totalTaxSavings += taxSavings;
    totalCapGains += capitalGain;
    totalCapGainsTaxSaved += capitalGainsTaxSaved;
  }

  const capGainsPct = totalTaxSavings > 0 ? Math.round((totalCapGainsTaxSaved / totalTaxSavings) * 100) : 0;
  const rationale = [
    `Prioritizes holdings with highest appreciation to maximize capital gains tax savings.`,
    `Avoids $${Math.round(totalCapGains).toLocaleString()} in capital gains (saves $${Math.round(totalCapGainsTaxSaved).toLocaleString()} in tax).`,
    `Total tax benefit: $${Math.round(totalTaxSavings).toLocaleString()} (${capGainsPct}% from capital gains savings).`,
  ];

  const warnings: string[] = [];
  if (totalAmount < (donationGoal || 0)) {
    warnings.push(`Could only allocate $${totalAmount.toLocaleString()} of $${donationGoal?.toLocaleString()} goal due to AGI limits.`);
  }

  return {
    rank: 0,
    strategy_name: 'Donate Most Appreciated Assets',
    description: 'Maximize capital gains tax savings by donating your most appreciated holdings first',
    confidence_score: 95,
    tax_savings: totalTaxSavings,
    recommendations,
    rationale,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Strategy 2: Maximize current year deduction without carryforward.
 * Considers both the 60% cash bucket and the 30% appreciated-assets bucket.
 */
function maximizeCurrentYearDeduction(
  taxSituation: TaxSituation,
  holdings: PortfolioHolding[]
): OptimizationRecommendation | null {
  const agiLimit60Pct = taxSituation.agi * 0.60;
  const agiLimit30Pct = taxSituation.agi * 0.30;
  const cashCapacity = agiLimit60Pct - (taxSituation.existing_contributions_60_pct ?? 0);
  const appreciatedCapacity = agiLimit30Pct - (taxSituation.existing_contributions_30_pct ?? 0);
  const remainingCapacity = appreciatedCapacity;

  if (remainingCapacity <= 0 && cashCapacity <= 0) {
    return null;
  }

  // Find holdings that can fill remaining appreciated-assets capacity
  const sortedHoldings = holdings
    .filter(h => h.fmv && h.fmv > 0)
    .sort((a, b) => {
      const aGain = a.cost_basis && a.fmv ? a.fmv - a.cost_basis : 0;
      const bGain = b.cost_basis && b.fmv ? b.fmv - b.cost_basis : 0;
      return bGain - aGain; // Highest gain first
    });

  const recommendations: DonationRecommendation[] = [];
  let totalAmount = 0;
  let totalTaxSavings = 0;

  for (const holding of sortedHoldings) {
    if (totalAmount >= remainingCapacity) break;

    const amountToFill = remainingCapacity - totalAmount;
    const amountToDonate = Math.min(holding.fmv!, amountToFill);

    const costBasis = holding.cost_basis || amountToDonate;
    const proportionalCostBasis = (costBasis / holding.fmv!) * amountToDonate;
    const capitalGain = amountToDonate - proportionalCostBasis;
    const capitalGainsTaxSaved = capitalGain * capGainsRate(holding);
    const deductionValue = amountToDonate * 0.37;
    const taxSavings = capitalGainsTaxSaved + deductionValue;

    recommendations.push({
      holding_id: holding.id,
      holding_name: holding.name,
      amount: amountToDonate,
      timing: 'now',
      reason: `Fill AGI capacity - no carryforward needed`,
      tax_impact: {
        deductible: amountToDonate,
        carryforward: 0,
        capital_gains_avoided: capitalGain,
        total_tax_savings: taxSavings,
      },
    });

    totalAmount += amountToDonate;
    totalTaxSavings += taxSavings;
  }

  const utilizationPct = agiLimit30Pct > 0 ? (totalAmount / agiLimit30Pct) * 100 : 0;

  const rationale = [
    `Maximizes current year deduction without carryforward.`,
    `Fills ${Math.round(utilizationPct)}% of your 30% appreciated-assets limit ($${agiLimit30Pct.toLocaleString()}).`,
    `Donate exactly $${totalAmount.toLocaleString()} in appreciated assets to use all available capacity.`,
  ];

  // Surface the 60% cash bucket capacity if it exceeds the 30% bucket
  if (cashCapacity > appreciatedCapacity) {
    rationale.push(
      `You also have $${Math.round(cashCapacity).toLocaleString()} of unused 60% cash AGI capacity — ` +
      `cash donations to public charities could shelter an additional $${Math.round(cashCapacity - appreciatedCapacity).toLocaleString()} beyond appreciated-asset limits.`
    );
  }

  return {
    rank: 0,
    strategy_name: 'Maximize Current Year Deduction',
    description: 'Fill your AGI limit perfectly without generating carryforward',
    confidence_score: 90,
    tax_savings: totalTaxSavings,
    recommendations,
    rationale,
  };
}

/**
 * Strategy 3: Spread donations over multiple years
 */
function optimizeSpreadStrategy(
  taxSituation: TaxSituation,
  holdings: PortfolioHolding[],
  donationGoal: number,
  timeHorizon: number
): OptimizationRecommendation | null {
  const annualAmount = donationGoal / timeHorizon;
  const agiLimit = taxSituation.agi * 0.30;

  // Check if spreading helps avoid carryforward
  if (annualAmount > agiLimit) {
    return null; // Spreading doesn't help - each year still exceeds limit
  }

  const recommendations: DonationRecommendation[] = [];
  const projection: MultiYearProjection = {
    year_1: {
      year: new Date().getFullYear(),
      donations: 0,
      deductible: 0,
      carryforward_used: 0,
      carryforward_generated: 0,
      tax_savings: 0,
    },
  };
  let totalTaxSavings = 0;

  for (let year = 0; year < timeHorizon; year++) {
    const yearNum = new Date().getFullYear() + year;
    const timing = year === 0 ? 'now' : year === 1 ? 'next_year' : `year_${year}` as any;

    // Select holdings for this year
    const yearHoldings = holdings.filter((_, idx) => idx % timeHorizon === year);

    for (const holding of yearHoldings) {
      const amountForThisHolding = Math.min(holding.fmv || 0, annualAmount / yearHoldings.length);

      if (amountForThisHolding > 0) {
        const costBasis = holding.cost_basis || amountForThisHolding;
        const proportionalCostBasis = (costBasis / (holding.fmv || amountForThisHolding)) * amountForThisHolding;
        const capitalGain = amountForThisHolding - proportionalCostBasis;
        const taxSavings = (capitalGain * capGainsRate(holding)) + (amountForThisHolding * 0.37);

        recommendations.push({
          holding_id: holding.id,
          holding_name: holding.name,
          amount: amountForThisHolding,
          timing,
          reason: `Year ${year + 1} of ${timeHorizon}-year plan`,
          tax_impact: {
            deductible: amountForThisHolding,
            carryforward: 0,
            capital_gains_avoided: capitalGain,
            total_tax_savings: taxSavings,
          },
        });

        totalTaxSavings += taxSavings;
      }
    }

    projection[`year_${year + 1}`] = {
      year: yearNum,
      donations: annualAmount,
      deductible: annualAmount,
      carryforward_used: 0,
      carryforward_generated: 0,
      tax_savings: annualAmount * 0.37,
    };
  }

  const rationale = [
    `Spreads $${donationGoal.toLocaleString()} evenly over ${timeHorizon} years.`,
    `Annual donation: $${annualAmount.toLocaleString()} (within ${Math.round((annualAmount / agiLimit) * 100)}% of AGI limit).`,
    `No carryforward needed - full deduction each year.`,
  ];

  return {
    rank: 0,
    strategy_name: `${timeHorizon}-Year Spread Strategy`,
    description: `Spread donations evenly to avoid carryforward and maintain consistent deductions`,
    confidence_score: 85,
    tax_savings: totalTaxSavings,
    recommendations,
    multi_year_projection: projection,
    rationale,
  };
}

/**
 * Strategy 4: Bunching strategy (donate 2x every other year)
 */
function optimizeBunchingStrategy(
  taxSituation: TaxSituation,
  holdings: PortfolioHolding[],
  donationGoal: number,
  timeHorizon: number
): OptimizationRecommendation | null {
  const annualAmount = donationGoal / timeHorizon;
  const bunchAmount = annualAmount * 2;

  // Run bunching analysis
  const analysis = analyzeBunchingStrategy({
    agi: taxSituation.agi,
    annual_donation_amount: annualAmount,
    donation_type: 'stock',
    years_to_analyze: timeHorizon,
  });

  if (analysis.recommendation !== 'bunch') {
    return null; // Bunching not recommended
  }

  const recommendations: DonationRecommendation[] = [];
  const projection: MultiYearProjection = {
    year_1: {
      year: new Date().getFullYear(),
      donations: 0,
      deductible: 0,
      carryforward_used: 0,
      carryforward_generated: 0,
      tax_savings: 0,
    },
  };
  let totalTaxSavings = analysis.bunching_strategy.tax_savings;

  // Create bunching pattern: donate in years 0, 2, 4...
  for (let year = 0; year < timeHorizon; year++) {
    const isBunchYear = year % 2 === 0;
    const yearNum = new Date().getFullYear() + year;
    const timing = year === 0 ? 'now' : year === 1 ? 'next_year' : `year_${year}` as any;

    if (isBunchYear) {
      const amount = Math.min(bunchAmount, taxSituation.agi * 0.30);

      recommendations.push({
        holding_id: holdings[0]?.id || '',
        holding_name: holdings[0]?.name || 'Holdings',
        amount,
        timing,
        reason: `Bunch year - donate 2x to itemize deductions`,
        tax_impact: {
          deductible: amount,
          carryforward: Math.max(bunchAmount - amount, 0),
          capital_gains_avoided: 0,
          total_tax_savings: amount * 0.37,
        },
      });

      projection[`year_${year + 1}`] = {
        year: yearNum,
        donations: bunchAmount,
        deductible: amount,
        carryforward_used: 0,
        carryforward_generated: Math.max(bunchAmount - amount, 0),
        tax_savings: Math.max(amount - getStandardDeduction(yearNum, taxSituation.filing_status as any || 'married_joint'), 0) * 0.37,
      };
    } else {
      projection[`year_${year + 1}`] = {
        year: yearNum,
        donations: 0,
        deductible: 0,
        carryforward_used: 0,
        carryforward_generated: 0,
        tax_savings: 0,
      };
    }
  }

  const savingsVsSpread = analysis.savings_difference;

  const rationale = [
    `Donate ${bunchAmount.toLocaleString()} every other year instead of $${annualAmount.toLocaleString()} annually.`,
    `In bunch years, itemize deductions. In off years, use standard deduction.`,
    `Save additional $${Math.round(savingsVsSpread).toLocaleString()} vs spreading evenly.`,
  ];

  return {
    rank: 0,
    strategy_name: 'Bunching Strategy',
    description: 'Bunch donations every other year to maximize itemized deduction benefit',
    confidence_score: 80,
    tax_savings: totalTaxSavings,
    recommendations,
    multi_year_projection: projection,
    rationale,
  };
}

/**
 * Strategy 5: QCD Optimization (for donors 70.5+)
 */
function optimizeQCDStrategy(
  taxSituation: TaxSituation,
  holdings: PortfolioHolding[]
): OptimizationRecommendation | null {
  if (!taxSituation.age || taxSituation.age < 70.5) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const qcdLimit = getQCDLimit(currentYear);
  const iraHoldings = holdings.filter(h => h.asset_type === 'qcd_distribution' || h.name.toLowerCase().includes('ira'));

  if (iraHoldings.length === 0) {
    return null;
  }

  const recommendations: DonationRecommendation[] = [];
  let totalAmount = 0;
  let totalTaxSavings = 0;

  for (const holding of iraHoldings) {
    if (totalAmount >= qcdLimit) break;

    const amount = Math.min(holding.fmv || 0, qcdLimit - totalAmount);
    const taxSavings = amount * 0.37; // Excluded from income at marginal rate

    recommendations.push({
      holding_id: holding.id,
      holding_name: holding.name,
      amount,
      timing: 'now',
      reason: 'QCD excluded from income - better than deduction',
      tax_impact: {
        deductible: 0, // QCDs don't go on Schedule A
        carryforward: 0,
        capital_gains_avoided: 0,
        total_tax_savings: taxSavings,
      },
    });

    totalAmount += amount;
    totalTaxSavings += taxSavings;
  }

  const rationale = [
    `At age ${taxSituation.age}, you're eligible for Qualified Charitable Distributions (QCDs).`,
    `QCDs up to $${qcdLimit.toLocaleString()}/year are excluded from income (better than a deduction).`,
    `Counts toward Required Minimum Distribution (RMD).`,
    `Avoids increasing AGI, which can reduce other tax benefits.`,
  ];

  return {
    rank: 0,
    strategy_name: 'QCD Strategy',
    description: 'Use Qualified Charitable Distributions to exclude income from RMD',
    confidence_score: 98,
    tax_savings: totalTaxSavings,
    recommendations,
    rationale,
  };
}

/**
 * Generate executive summary of optimization
 */
export function generateOptimizationSummary(recommendations: OptimizationRecommendation[]): string {
  if (recommendations.length === 0) {
    return 'No optimization strategies available based on current holdings and tax situation.';
  }

  const best = recommendations[0];
  const totalSavings = recommendations.reduce((sum, r) => sum + r.tax_savings, 0);

  let summary = `💡 Top Recommendation: ${best.strategy_name}\n\n`;
  summary += `${best.description}\n\n`;
  summary += `Tax Savings: $${Math.round(best.tax_savings).toLocaleString()}\n`;
  summary += `Confidence: ${best.confidence_score}%\n\n`;

  summary += `Key Actions:\n`;
  best.recommendations.slice(0, 3).forEach((rec, idx) => {
    summary += `${idx + 1}. ${rec.holding_name}: Donate $${rec.amount.toLocaleString()} ${rec.timing}\n`;
  });

  if (best.recommendations.length > 3) {
    summary += `... and ${best.recommendations.length - 3} more\n`;
  }

  summary += `\nAlternative Strategies:\n`;
  recommendations.slice(1, 3).forEach((alt, idx) => {
    summary += `${idx + 2}. ${alt.strategy_name} - Save $${Math.round(alt.tax_savings).toLocaleString()}\n`;
  });

  return summary;
}
