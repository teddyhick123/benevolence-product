/**
 * Carryforward Tracker
 *
 * Tracks charitable contribution carryforwards across multiple tax years.
 * Carryforwards expire after 5 years and are applied FIFO (oldest first).
 */

import type { AGILimitCategory } from '@/lib/schemas/tax';

export interface TaxCarryforward {
  id: string;
  portfolio_id: string;
  tax_contribution_id: string | null;
  originating_tax_year: number;
  amount: number;
  amount_remaining: number;
  agi_limit_category: AGILimitCategory;
  expires_tax_year: number;
  recipient_name: string | null;
  recipient_ein: string | null;
}

export interface CarryforwardApplication {
  carryforwardId: string;
  amountApplied: number;
  amountRemaining: number;
  originatingYear: number;
  expiresYear: number;
}

export interface CarryforwardSummary {
  totalAvailable: number;
  byCategory: Record<AGILimitCategory, number>;
  byExpirationYear: Record<number, number>;
  expiringSoon: TaxCarryforward[]; // Expiring within 2 years
  expired: TaxCarryforward[];
}

/**
 * Calculate how much of a carryforward can be applied in current year
 */
export function calculateCarryforwardApplication(
  carryforward: TaxCarryforward,
  availableLimit: number
): {
  amountToApply: number;
  newRemaining: number;
  fullyUsed: boolean;
} {
  const amountToApply = Math.min(carryforward.amount_remaining, availableLimit);
  const newRemaining = carryforward.amount_remaining - amountToApply;
  const fullyUsed = newRemaining === 0;

  return {
    amountToApply,
    newRemaining,
    fullyUsed,
  };
}

/**
 * Apply carryforwards to current year using FIFO (oldest first)
 * Returns list of applications to update in database
 */
export function applyCarryforwards(
  carryforwards: TaxCarryforward[],
  availableLimitByCategory: Record<AGILimitCategory, number>,
  currentTaxYear: number
): CarryforwardApplication[] {
  // Filter for active carryforwards (not expired, has remaining amount)
  const activeCarryforwards = carryforwards.filter(
    (cf) =>
      cf.amount_remaining > 0 &&
      cf.expires_tax_year >= currentTaxYear
  );

  // Sort by expiration year (FIFO - oldest/soonest to expire first)
  const sortedCarryforwards = [...activeCarryforwards].sort(
    (a, b) => a.expires_tax_year - b.expires_tax_year
  );

  const applications: CarryforwardApplication[] = [];
  const remainingLimits = { ...availableLimitByCategory };

  sortedCarryforwards.forEach((cf) => {
    const availableForCategory = remainingLimits[cf.agi_limit_category];

    if (availableForCategory > 0) {
      const amountToApply = Math.min(cf.amount_remaining, availableForCategory);

      if (amountToApply > 0) {
        applications.push({
          carryforwardId: cf.id,
          amountApplied: amountToApply,
          amountRemaining: cf.amount_remaining - amountToApply,
          originatingYear: cf.originating_tax_year,
          expiresYear: cf.expires_tax_year,
        });

        // Update remaining limit for this category
        remainingLimits[cf.agi_limit_category] -= amountToApply;
      }
    }
  });

  return applications;
}

/**
 * Generate carryforward summary for dashboard
 */
export function summarizeCarryforwards(
  carryforwards: TaxCarryforward[],
  currentTaxYear: number
): CarryforwardSummary {
  const activeCarryforwards = carryforwards.filter(
    (cf) => cf.amount_remaining > 0 && cf.expires_tax_year >= currentTaxYear
  );

  const expired = carryforwards.filter(
    (cf) => cf.amount_remaining > 0 && cf.expires_tax_year < currentTaxYear
  );

  const expiringSoon = activeCarryforwards.filter(
    (cf) => cf.expires_tax_year <= currentTaxYear + 2
  );

  const totalAvailable = activeCarryforwards.reduce(
    (sum, cf) => sum + cf.amount_remaining,
    0
  );

  // Group by category
  const byCategory = activeCarryforwards.reduce(
    (acc, cf) => {
      acc[cf.agi_limit_category] =
        (acc[cf.agi_limit_category] || 0) + cf.amount_remaining;
      return acc;
    },
    {} as Record<AGILimitCategory, number>
  );

  // Ensure all categories exist in the result
  const categories: AGILimitCategory[] = [
    '60_cash',
    '30_appreciated',
    '30_foundation_cash',
    '20_foundation_property',
  ];
  categories.forEach((cat) => {
    if (!byCategory[cat]) {
      byCategory[cat] = 0;
    }
  });

  // Group by expiration year
  const byExpirationYear = activeCarryforwards.reduce(
    (acc, cf) => {
      acc[cf.expires_tax_year] =
        (acc[cf.expires_tax_year] || 0) + cf.amount_remaining;
      return acc;
    },
    {} as Record<number, number>
  );

  return {
    totalAvailable,
    byCategory,
    byExpirationYear,
    expiringSoon,
    expired,
  };
}

/**
 * Generate alerts for expiring carryforwards
 */
export interface CarryforwardAlert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  carryforwards: TaxCarryforward[];
  actionRequired: string;
}

export function generateCarryforwardAlerts(
  carryforwards: TaxCarryforward[],
  currentTaxYear: number,
  estimatedAGI?: number
): CarryforwardAlert[] {
  const alerts: CarryforwardAlert[] = [];

  // Check for carryforwards expiring this year
  const expiringThisYear = carryforwards.filter(
    (cf) =>
      cf.amount_remaining > 0 && cf.expires_tax_year === currentTaxYear
  );

  if (expiringThisYear.length > 0) {
    const totalExpiring = expiringThisYear.reduce(
      (sum, cf) => sum + cf.amount_remaining,
      0
    );

    alerts.push({
      severity: 'critical',
      title: 'Carryforwards Expiring This Year',
      message: `$${totalExpiring.toLocaleString()} in charitable contribution carryforwards expire on December 31, ${currentTaxYear}. If not used, this deduction will be lost.`,
      carryforwards: expiringThisYear,
      actionRequired: estimatedAGI
        ? `Ensure your AGI is sufficient to utilize these carryforwards. You may need to realize additional income or adjust contribution timing.`
        : 'Enter your estimated AGI to see if you can utilize these carryforwards.',
    });
  }

  // Check for carryforwards expiring next year
  const expiringNextYear = carryforwards.filter(
    (cf) =>
      cf.amount_remaining > 0 &&
      cf.expires_tax_year === currentTaxYear + 1
  );

  if (expiringNextYear.length > 0) {
    const totalExpiring = expiringNextYear.reduce(
      (sum, cf) => sum + cf.amount_remaining,
      0
    );

    alerts.push({
      severity: 'warning',
      title: 'Carryforwards Expiring Next Year',
      message: `$${totalExpiring.toLocaleString()} in carryforwards will expire on December 31, ${currentTaxYear + 1}. Plan ahead to maximize utilization.`,
      carryforwards: expiringNextYear,
      actionRequired:
        'Consider increasing AGI next year or reducing new contributions to utilize existing carryforwards.',
    });
  }

  // Check for already expired carryforwards (shouldn't happen, but good to catch)
  const alreadyExpired = carryforwards.filter(
    (cf) =>
      cf.amount_remaining > 0 && cf.expires_tax_year < currentTaxYear
  );

  if (alreadyExpired.length > 0) {
    const totalExpired = alreadyExpired.reduce(
      (sum, cf) => sum + cf.amount_remaining,
      0
    );

    alerts.push({
      severity: 'info',
      title: 'Expired Carryforwards',
      message: `$${totalExpired.toLocaleString()} in carryforwards have expired and can no longer be deducted.`,
      carryforwards: alreadyExpired,
      actionRequired:
        'These carryforwards should be marked as expired in your records.',
    });
  }

  return alerts;
}

/**
 * Optimize carryforward utilization strategy
 */
export interface CarryforwardStrategy {
  recommendation: string;
  steps: string[];
  expectedOutcome: {
    carryforwardsUtilized: number;
    carryforwardsRemaining: number;
    yearsToFullUtilization: number;
  };
}

export function optimizeCarryforwardStrategy(
  carryforwards: TaxCarryforward[],
  estimatedAGI: number,
  currentTaxYear: number,
  plannedNewContributions: number = 0
): CarryforwardStrategy {
  const summary = summarizeCarryforwards(carryforwards, currentTaxYear);
  const steps: string[] = [];

  // Calculate available capacity after new contributions
  // Assume most contributions will be cash to public charities (60% limit)
  const cashLimit = estimatedAGI * 0.6;
  const availableAfterNew = Math.max(0, cashLimit - plannedNewContributions);

  // Determine if carryforwards can be fully utilized
  const canUtilizeThisYear = summary.totalAvailable <= availableAfterNew;

  if (canUtilizeThisYear) {
    steps.push(
      `With an AGI of $${estimatedAGI.toLocaleString()}, you can fully utilize all $${summary.totalAvailable.toLocaleString()} in carryforwards this year.`
    );

    if (plannedNewContributions > 0) {
      steps.push(
        `After accounting for $${plannedNewContributions.toLocaleString()} in new contributions, you still have capacity for all carryforwards.`
      );
    }

    return {
      recommendation: 'Full utilization possible this year',
      steps,
      expectedOutcome: {
        carryforwardsUtilized: summary.totalAvailable,
        carryforwardsRemaining: 0,
        yearsToFullUtilization: 1,
      },
    };
  } else {
    // Partial utilization
    const utilizableThisYear = availableAfterNew;
    const remainingAfterThisYear = summary.totalAvailable - utilizableThisYear;

    steps.push(
      `With an AGI of $${estimatedAGI.toLocaleString()} and $${plannedNewContributions.toLocaleString()} in new contributions, you can utilize $${utilizableThisYear.toLocaleString()} of your carryforwards this year.`
    );

    steps.push(
      `$${remainingAfterThisYear.toLocaleString()} will remain for future years.`
    );

    // Check if any will expire before being utilized
    const expiringAmount = summary.expiringSoon.reduce(
      (sum, cf) => sum + cf.amount_remaining,
      0
    );

    if (expiringAmount > utilizableThisYear) {
      steps.push(
        `⚠️ Warning: Some carryforwards may expire before being fully utilized. Consider reducing new contributions or increasing AGI.`
      );
    }

    // Estimate years to full utilization (rough estimate)
    const yearsToFullUtilization = Math.ceil(
      remainingAfterThisYear / availableAfterNew
    );

    return {
      recommendation: 'Partial utilization - multi-year strategy needed',
      steps,
      expectedOutcome: {
        carryforwardsUtilized: utilizableThisYear,
        carryforwardsRemaining: remainingAfterThisYear,
        yearsToFullUtilization: yearsToFullUtilization + 1,
      },
    };
  }
}
