/**
 * Tax Constants
 *
 * IRS standard deduction amounts and other tax-related constants.
 * These should be updated annually as IRS publishes new figures.
 */

import type { FilingStatus } from '@/lib/schemas/tax';

/**
 * Standard deduction amounts by year and filing status
 * Source: IRS Revenue Procedures and One Big Beautiful Bill Act (2025)
 */
export const STANDARD_DEDUCTION: Record<
  number,
  Record<FilingStatus, number>
> = {
  2026: {
    single: 16100,
    married_joint: 32200,
    married_separate: 16100,
    head_of_household: 24150,
  },
  2025: {
    single: 15750,
    married_joint: 31500,
    married_separate: 15750,
    head_of_household: 23625,
  },
  2024: {
    single: 14600,
    married_joint: 29200,
    married_separate: 14600,
    head_of_household: 21900,
  },
  2023: {
    single: 13850,
    married_joint: 27700,
    married_separate: 13850,
    head_of_household: 20800,
  },
  2022: {
    single: 12950,
    married_joint: 25900,
    married_separate: 12950,
    head_of_household: 19400,
  },
};

/**
 * Additional standard deduction for taxpayers 65 or older (per person)
 * Source: IRS Revenue Procedures
 */
export const ADDITIONAL_STANDARD_DEDUCTION_65_PLUS: Record<
  number,
  { single_or_hoh: number; married: number }
> = {
  2026: { single_or_hoh: 2050, married: 1650 },
  2025: { single_or_hoh: 2000, married: 1600 },
  2024: { single_or_hoh: 1950, married: 1550 },
  2023: { single_or_hoh: 1850, married: 1500 },
};

/**
 * OBBB Senior Bonus Deduction (One Big Beautiful Bill Act)
 * Available for tax years 2025-2028 for taxpayers 65+
 * Phases out at $75,000 AGI (single) or $150,000 (joint)
 */
export const OBBB_SENIOR_BONUS_DEDUCTION = {
  AMOUNT_PER_PERSON: 6000,
  PHASE_OUT_START_SINGLE: 75000,
  PHASE_OUT_START_JOINT: 150000,
  PHASE_OUT_RATE: 0.06, // 6% reduction per dollar over threshold
  EFFECTIVE_YEARS: [2025, 2026, 2027, 2028] as const,
} as const;

/**
 * Get standard deduction for a given year and filing status
 * Falls back to most recent year if year not found
 */
export function getStandardDeduction(
  year: number,
  filingStatus: FilingStatus
): number {
  const yearData = STANDARD_DEDUCTION[year] || STANDARD_DEDUCTION[2026];
  return yearData[filingStatus];
}

/**
 * Get additional standard deduction for seniors (65+)
 */
export function getAdditionalStandardDeduction65Plus(
  year: number,
  filingStatus: FilingStatus,
  numberOfQualifyingIndividuals: number = 1
): number {
  const yearData = ADDITIONAL_STANDARD_DEDUCTION_65_PLUS[year] ||
    ADDITIONAL_STANDARD_DEDUCTION_65_PLUS[2026];

  const isSingleOrHOH = filingStatus === 'single' || filingStatus === 'head_of_household';
  const perPersonAmount = isSingleOrHOH ? yearData.single_or_hoh : yearData.married;

  return perPersonAmount * numberOfQualifyingIndividuals;
}

/**
 * AGI limit percentages for charitable contributions
 * Note: 60% cash limit made permanent by OBBB Act (signed July 4, 2025)
 */
export const AGI_LIMIT_PERCENTAGES = {
  CASH_PUBLIC_CHARITY: 0.60, // 60% of AGI (permanent as of OBBB 2025)
  APPRECIATED_ASSETS_PUBLIC: 0.30, // 30% of AGI
  CASH_PRIVATE_FOUNDATION: 0.30, // 30% of AGI
  PROPERTY_PRIVATE_FOUNDATION: 0.20, // 20% of AGI
} as const;

/**
 * QCD (Qualified Charitable Distribution) Limits by Year
 * Starting 2024, the $100k limit is indexed for inflation per SECURE 2.0 Act
 * Source: IRS Revenue Procedures
 */
export const QCD_LIMITS: Record<number, {
  annual_limit: number;
  split_interest_limit: number; // One-time CRT/gift annuity contribution
}> = {
  2026: { annual_limit: 111000, split_interest_limit: 55000 },
  2025: { annual_limit: 108000, split_interest_limit: 54000 },
  2024: { annual_limit: 105000, split_interest_limit: 53000 },
  2023: { annual_limit: 100000, split_interest_limit: 0 }, // No split-interest before SECURE 2.0
};

/**
 * Get QCD limit for a given year
 */
export function getQCDLimit(year: number): number {
  return QCD_LIMITS[year]?.annual_limit || QCD_LIMITS[2026].annual_limit;
}

/**
 * Get QCD split-interest gift limit for a given year
 * This is a one-time election for contributions to CRT or charitable gift annuity
 */
export function getQCDSplitInterestLimit(year: number): number {
  return QCD_LIMITS[year]?.split_interest_limit || QCD_LIMITS[2026].split_interest_limit;
}

/**
 * QCD Eligibility Requirements
 */
export const QCD_REQUIREMENTS = {
  MINIMUM_AGE: 70.5, // Must be 70½ or older
  ELIGIBLE_ACCOUNT_TYPES: ['IRA', 'Inherited IRA', 'Inactive SEP IRA', 'Inactive SIMPLE IRA'] as const,
  INELIGIBLE_RECIPIENTS: ['donor_advised_fund', 'private_foundation', 'supporting_organization'] as const,
} as const;

/**
 * OBBB Charitable Deduction Changes (One Big Beautiful Bill Act)
 * Effective for tax years beginning 2026
 * Source: One Big Beautiful Bill Act, signed July 4, 2025
 */
export const OBBB_CHARITABLE_CHANGES = {
  EFFECTIVE_YEAR: 2026,

  /**
   * 0.5% AGI Floor: Only charitable contributions exceeding 0.5% of AGI are deductible
   * Example: If AGI is $100,000, first $500 in donations is not deductible
   */
  AGI_FLOOR_PERCENTAGE: 0.005, // 0.5%

  /**
   * 35% Benefit Cap: High earners (37% bracket) get maximum 35% benefit
   * This reduces the value of charitable deductions for top earners
   */
  MAX_DEDUCTION_BENEFIT_RATE: 0.35, // 35% cap

  /**
   * Universal Charitable Deduction for Non-Itemizers
   * Available even when taking standard deduction
   * Does NOT apply to DAFs, supporting orgs, or private foundations
   */
  UNIVERSAL_DEDUCTION: {
    SINGLE: 1000,
    MARRIED_JOINT: 2000,
    INELIGIBLE_RECIPIENTS: ['daf', '501c3_private_foundation', 'supporting_organization'] as const,
  },

  /**
   * Corporate Charitable Floor
   * Corporations can only deduct gifts exceeding 1% of taxable income
   */
  CORPORATE_FLOOR_PERCENTAGE: 0.01, // 1%
} as const;

/**
 * Calculate the OBBB AGI floor amount (0.5% of AGI)
 * Only donations exceeding this floor are deductible starting 2026
 */
export function calculateOBBBAGIFloor(agi: number, taxYear: number): number {
  if (taxYear < OBBB_CHARITABLE_CHANGES.EFFECTIVE_YEAR) {
    return 0; // No floor before 2026
  }
  return agi * OBBB_CHARITABLE_CHANGES.AGI_FLOOR_PERCENTAGE;
}

/**
 * Calculate effective deduction value considering OBBB 35% cap
 * For taxpayers in 37% bracket, benefit is capped at 35%
 */
export function calculateEffectiveDeductionValue(
  deductionAmount: number,
  marginalRate: number,
  taxYear: number
): number {
  if (taxYear < OBBB_CHARITABLE_CHANGES.EFFECTIVE_YEAR) {
    return deductionAmount * marginalRate;
  }

  const effectiveRate = Math.min(marginalRate, OBBB_CHARITABLE_CHANGES.MAX_DEDUCTION_BENEFIT_RATE);
  return deductionAmount * effectiveRate;
}

/**
 * Get universal charitable deduction for non-itemizers (OBBB 2026+)
 */
export function getUniversalCharitableDeduction(
  filingStatus: FilingStatus,
  taxYear: number
): number {
  if (taxYear < OBBB_CHARITABLE_CHANGES.EFFECTIVE_YEAR) {
    return 0; // Not available before 2026
  }

  return filingStatus === 'married_joint'
    ? OBBB_CHARITABLE_CHANGES.UNIVERSAL_DEDUCTION.MARRIED_JOINT
    : OBBB_CHARITABLE_CHANGES.UNIVERSAL_DEDUCTION.SINGLE;
}

/**
 * Substantiation thresholds
 */
export const SUBSTANTIATION_THRESHOLDS = {
  BANK_RECORD_ONLY: 250, // Under $250: bank record sufficient
  ACKNOWLEDGMENT_REQUIRED: 250, // $250+: written acknowledgment required
  FORM_8283_THRESHOLD: 500, // $500+: Form 8283 required for non-cash
  QUALIFIED_APPRAISAL_THRESHOLD: 5000, // $5,000+: qualified appraisal required
  QUID_PRO_QUO_DISCLOSURE: 75, // $75+: charity must disclose if goods/services provided
} as const;

/**
 * Carryforward period (years)
 */
export const CARRYFORWARD_YEARS = 5;

/**
 * Private foundation excise tax rates
 * Note: As of tax years beginning after December 20, 2019, ALL private foundations
 * use the flat 1.39% rate. The previous 2%/1% variable rate system was eliminated.
 * Source: IRC Section 4940(a), as amended by the Taxpayer Certainty and Disaster Tax Relief Act
 */
export const FOUNDATION_EXCISE_TAX = {
  FLAT_RATE: 1.39, // 1.39% on net investment income (all foundations)
  // Legacy rates (historical reference only, no longer applicable):
  // HISTORICAL_HIGHER_RATE: 2.0, // Was 2% if payout < average of prior 5 years (pre-2020)
  // HISTORICAL_REDUCED_RATE: 1.0, // Was 1% for qualifying foundations (pre-2020)
} as const;

/**
 * Private foundation penalty taxes for failure to distribute
 * Source: IRC Section 4942
 */
export const FOUNDATION_DISTRIBUTION_PENALTIES = {
  INITIAL_PENALTY_RATE: 0.30, // 30% tax on undistributed income
  ADDITIONAL_PENALTY_RATE: 1.00, // 100% tax if not corrected within 90 days of IRS notice
} as const;

/**
 * Private foundation minimum payout requirement
 */
export const FOUNDATION_MINIMUM_PAYOUT_PERCENTAGE = 0.05; // 5% of assets

/**
 * Tax year range for selection
 */
export const CURRENT_TAX_YEAR = new Date().getFullYear();
export const TAX_YEAR_RANGE = {
  MIN: 2020,
  MAX: CURRENT_TAX_YEAR + 1, // Allow planning for next year
} as const;

/**
 * Document upload limits
 */
export const DOCUMENT_UPLOAD = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ],
  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.docx'],
} as const;

/**
 * Tax disclaimer text (used on all tax-related pages)
 */
export const TAX_DISCLAIMER = `
IMPORTANT DISCLAIMER:

This software provides tools to organize charitable contribution data
for tax planning purposes. It does NOT constitute tax advice.

• All calculations are estimates based on current tax law
• Tax laws change; verify current rules with a tax professional
• This tool does not replace professional tax preparation
• Generated forms are DRAFTS requiring CPA review
• User is responsible for accuracy of all reported information

IMPORTANT: The One Big Beautiful Bill Act (signed July 4, 2025) introduces
significant changes for tax year 2026, including a 0.5% AGI floor for
charitable deductions and a 35% cap on deduction benefits for high earners.

Consult a qualified tax professional before making tax-related decisions
or filing tax returns.
`.trim();

/**
 * Short disclaimer for inline use
 */
export const TAX_DISCLAIMER_SHORT =
  'This is an estimate for planning purposes. Consult a tax professional before filing.';

/**
 * EIN format validation pattern
 */
export const EIN_PATTERN = /^\d{2}-\d{7}$/;
export const EIN_PLACEHOLDER = 'XX-XXXXXXX';

/**
 * Contribution type labels
 */
export const CONTRIBUTION_TYPE_LABELS = {
  cash: 'Cash',
  check: 'Check',
  wire: 'Wire Transfer',
  stock: 'Stock/Securities',
  crypto: 'Cryptocurrency',
  real_estate: 'Real Estate',
  other_property: 'Other Property',
} as const;

/**
 * Recipient type labels
 */
export const RECIPIENT_TYPE_LABELS = {
  '501c3_public': '501(c)(3) Public Charity',
  '501c3_private_foundation': '501(c)(3) Private Foundation',
  daf: 'Donor-Advised Fund',
  other: 'Other Qualified Organization',
} as const;

/**
 * Filing status labels
 */
export const FILING_STATUS_LABELS = {
  single: 'Single',
  married_joint: 'Married Filing Jointly',
  married_separate: 'Married Filing Separately',
  head_of_household: 'Head of Household',
} as const;

/**
 * Document type labels
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  acknowledgment: 'Written Acknowledgment',
  appraisal: 'Qualified Appraisal',
  form_8283: 'Form 8283',
  schedule_a: 'Schedule A',
  summary_report: 'Summary Report',
  other: 'Other Document',
} as const;
