/**
 * AGI Limit Calculator
 *
 * Calculates charitable contribution deduction limits based on IRS rules:
 * - Cash to public charities: 60% of AGI
 * - Appreciated assets to public charities: 30% of AGI
 * - Cash to private foundations: 30% of AGI
 * - Property to private foundations: 20% of AGI
 */

import type { AGILimitCategory } from '@/lib/schemas/tax';
import { calculateOBBBAGIFloor, calculateEffectiveDeductionValue } from '@/lib/tax/constants';

export interface TaxContribution {
  id: string;
  amount_usd: number;
  deductible_amount: number | null;
  contribution_type: string;
  recipient_type: string | null;
  contribution_date: string;
  agi_limit_category: AGILimitCategory | null;
}

export interface AGILimitBucket {
  category: AGILimitCategory;
  limit: number;
  used: number;
  available: number;
  contributions: TaxContribution[];
  percentageUsed: number;
}

export interface AGILimits {
  estimatedAGI: number;
  totalContributions: number;
  totalDeductible: number;
  totalCarryforward: number;
  buckets: Record<AGILimitCategory, AGILimitBucket>;
  /** OBBB 2026+: estimated tax savings after the 35% benefit cap (top bracket assumed 37%) */
  effectiveBenefitValue?: number;
}

export interface CarryforwardAmount {
  contributionId: string;
  amount: number;
  category: AGILimitCategory;
  expiresYear: number;
}

/**
 * Determine which AGI limit category a contribution falls into
 */
export function determineAGILimitCategory(
  contributionType: string,
  recipientType: string | null
): AGILimitCategory {
  const isNonCash = !['cash', 'check', 'wire'].includes(contributionType);
  const isFoundation = recipientType === '501c3_private_foundation';

  if (!isNonCash && !isFoundation) {
    return '60_cash'; // Cash to public charity
  } else if (isNonCash && !isFoundation) {
    return '30_appreciated'; // Appreciated assets to public charity
  } else if (!isNonCash && isFoundation) {
    return '30_foundation_cash'; // Cash to private foundation
  } else {
    return '20_foundation_property'; // Property to private foundation
  }
}

/**
 * Get AGI limit percentage for a category
 */
export function getAGILimitPercentage(category: AGILimitCategory): number {
  const percentages: Record<AGILimitCategory, number> = {
    '60_cash': 0.60,
    '30_appreciated': 0.30,
    '30_foundation_cash': 0.30,
    '20_foundation_property': 0.20,
  };
  return percentages[category];
}

/**
 * Get human-readable label for AGI category
 */
export function getAGILimitCategoryLabel(category: AGILimitCategory): string {
  const labels: Record<AGILimitCategory, string> = {
    '60_cash': 'Cash to Public Charities (60% limit)',
    '30_appreciated': 'Appreciated Assets to Public Charities (30% limit)',
    '30_foundation_cash': 'Cash to Private Foundations (30% limit)',
    '20_foundation_property': 'Property to Private Foundations (20% limit)',
  };
  return labels[category];
}

/**
 * Calculate AGI limits and determine carryforwards
 */
export function calculateAGILimits(
  contributions: TaxContribution[],
  estimatedAGI: number,
  taxYear: number
): {
  limits: AGILimits;
  carryforwards: CarryforwardAmount[];
} {
  // Initialize buckets
  const categories: AGILimitCategory[] = [
    '60_cash',
    '30_appreciated',
    '30_foundation_cash',
    '20_foundation_property',
  ];

  const buckets: Record<AGILimitCategory, AGILimitBucket> = {} as any;

  categories.forEach((category) => {
    const limitPercentage = getAGILimitPercentage(category);
    buckets[category] = {
      category,
      limit: estimatedAGI * limitPercentage,
      used: 0,
      available: estimatedAGI * limitPercentage,
      contributions: [],
      percentageUsed: 0,
    };
  });

  // Sort contributions by date (earliest first) for FIFO processing
  const sortedContributions = [...contributions].sort(
    (a, b) => new Date(a.contribution_date).getTime() - new Date(b.contribution_date).getTime()
  );

  let totalContributions = 0;
  let totalDeductible = 0;
  const carryforwards: CarryforwardAmount[] = [];

  // Process each contribution
  sortedContributions.forEach((contribution) => {
    const amount = contribution.deductible_amount ?? contribution.amount_usd;
    totalContributions += amount;

    // Determine category if not already set
    let category = contribution.agi_limit_category;
    if (!category) {
      category = determineAGILimitCategory(
        contribution.contribution_type,
        contribution.recipient_type
      );
    }

    const bucket = buckets[category];
    const availableSpace = bucket.limit - bucket.used;

    if (amount <= availableSpace) {
      // Fully deductible this year
      bucket.used += amount;
      totalDeductible += amount;
      bucket.contributions.push({
        ...contribution,
        deductible_amount: amount,
      });
    } else {
      // Partially deductible, rest carries forward
      const deductibleNow = availableSpace;
      const carryforwardAmount = amount - deductibleNow;

      if (deductibleNow > 0) {
        bucket.used += deductibleNow;
        totalDeductible += deductibleNow;
        bucket.contributions.push({
          ...contribution,
          deductible_amount: deductibleNow,
        });
      }

      if (carryforwardAmount > 0) {
        // Conservation easements have a 15-year carryforward; all others are 5 years
        const carryforwardYears = contribution.contribution_type === 'conservation_easement' ? 15 : 5;
        carryforwards.push({
          contributionId: contribution.id,
          amount: carryforwardAmount,
          category,
          expiresYear: taxYear + carryforwardYears,
        });
      }
    }

    // Update available and percentage used
    bucket.available = bucket.limit - bucket.used;
    bucket.percentageUsed = (bucket.used / bucket.limit) * 100;
  });

  // OBBB 2026 changes (One Big Beautiful Bill Act, effective tax year 2026):
  // 1. 0.5% AGI floor: only contributions exceeding 0.5% of AGI are deductible.
  //    Reduce totalDeductible by the floor amount (but never below zero).
  // 2. 35% benefit cap: for taxpayers in the 37% bracket, the effective deduction benefit
  //    is capped at 35%. effectiveBenefitValue reflects this cap (assuming 37% marginal rate).
  let effectiveBenefitValue: number | undefined;
  if (taxYear >= 2026) {
    const floor = calculateOBBBAGIFloor(estimatedAGI, taxYear);
    totalDeductible = Math.max(0, totalDeductible - floor);
    effectiveBenefitValue = calculateEffectiveDeductionValue(totalDeductible, 0.37, taxYear);
  }

  const limits: AGILimits = {
    estimatedAGI,
    totalContributions,
    totalDeductible,
    totalCarryforward: carryforwards.reduce((sum, cf) => sum + cf.amount, 0),
    buckets,
    effectiveBenefitValue,
  };

  return { limits, carryforwards };
}

/**
 * Calculate maximum additional contribution that can be made without carryforward
 */
export function calculateRemainingCapacity(
  limits: AGILimits,
  category: AGILimitCategory
): number {
  const bucket = limits.buckets[category];
  return Math.max(0, bucket.available);
}

/**
 * Recommend optimal contribution strategy
 */
export function recommendOptimalStrategy(
  limits: AGILimits
): {
  recommendation: string;
  details: string[];
  potentialSavings: number;
} {
  const recommendations: string[] = [];
  const details: string[] = [];
  let potentialSavings = 0;

  // Check if near limits in any category
  Object.values(limits.buckets).forEach((bucket) => {
    if (bucket.percentageUsed > 90 && bucket.percentageUsed < 100) {
      details.push(
        `You're at ${bucket.percentageUsed.toFixed(1)}% of your ${getAGILimitCategoryLabel(bucket.category)}. Consider spreading remaining contributions to next year.`
      );
    }
  });

  // Check for underutilized categories
  const cashBucket = limits.buckets['60_cash'];
  const appreciatedBucket = limits.buckets['30_appreciated'];

  if (cashBucket.percentageUsed < 50 && appreciatedBucket.available > 0) {
    details.push(
      `You have ${((appreciatedBucket.available / limits.estimatedAGI) * 100).toFixed(0)}% of AGI available for appreciated asset donations. Consider donating long-term appreciated stock instead of cash to avoid capital gains tax.`
    );
    // Estimate 20% capital gains tax savings on appreciated assets
    potentialSavings = appreciatedBucket.available * 0.20;
  }

  // Check for carryforward situation
  if (limits.totalCarryforward > 0) {
    details.push(
      `You have $${limits.totalCarryforward.toLocaleString()} in carryforward. This amount will be available for deduction over the next 5 years.`
    );
  }

  const recommendation =
    details.length > 0
      ? 'Optimize your contribution strategy'
      : 'Your contributions are well within AGI limits';

  return {
    recommendation,
    details,
    potentialSavings,
  };
}

/**
 * Analyze bunching strategy potential
 */
export function analyzeBunchingPotential(
  annualContributions: number,
  standardDeduction: number,
  otherItemizedDeductions: number = 0
): {
  recommended: boolean;
  currentApproach: {
    deductionYear1: number;
    deductionYear2: number;
    total: number;
  };
  bunchingApproach: {
    deductionYear1: number;
    deductionYear2: number;
    total: number;
  };
  additionalBenefit: number;
  explanation: string;
} {
  // Current approach: Contribute same amount each year
  const currentYear1 = Math.max(
    standardDeduction,
    annualContributions + otherItemizedDeductions
  );
  const currentYear2 = currentYear1;
  const currentTotal = currentYear1 + currentYear2;

  // Bunching approach: Double contributions in year 1, skip year 2
  const bunchYear1 = Math.max(
    standardDeduction,
    annualContributions * 2 + otherItemizedDeductions
  );
  const bunchYear2 = standardDeduction; // Take standard deduction in year 2
  const bunchTotal = bunchYear1 + bunchYear2;

  const additionalBenefit = bunchTotal - currentTotal;
  const recommended = additionalBenefit > 0;

  let explanation = '';
  if (recommended) {
    explanation = `By bunching 2 years of contributions into year 1, you can increase your total deductions by $${additionalBenefit.toLocaleString()} over the 2-year period. In year 1, contribute $${(annualContributions * 2).toLocaleString()} and itemize ($${bunchYear1.toLocaleString()} deduction). In year 2, take the standard deduction ($${standardDeduction.toLocaleString()}).`;
  } else {
    explanation = `Your current contribution level of $${annualContributions.toLocaleString()} per year already exceeds the standard deduction. Bunching would not provide additional benefit.`;
  }

  return {
    recommended,
    currentApproach: {
      deductionYear1: currentYear1,
      deductionYear2: currentYear2,
      total: currentTotal,
    },
    bunchingApproach: {
      deductionYear1: bunchYear1,
      deductionYear2: bunchYear2,
      total: bunchTotal,
    },
    additionalBenefit,
    explanation,
  };
}
