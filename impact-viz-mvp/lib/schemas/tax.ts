import { z } from 'zod';

/**
 * Enum schemas for tax-related types
 */
export const filingStatusSchema = z.enum([
  'single',
  'married_joint',
  'married_separate',
  'head_of_household',
]);

export const recipientTypeSchema = z.enum([
  '501c3_public',
  '501c3_private_foundation',
  'daf',
  'other',
]);

export const contributionTypeSchema = z.enum([
  'cash',
  'check',
  'wire',
  'stock',
  'crypto',
  'real_estate',
  'other_property',
]);

export const agiLimitCategorySchema = z.enum([
  '60_cash',
  '30_appreciated',
  '30_foundation_cash',
  '20_foundation_property',
]);

export const documentTypeSchema = z.enum([
  'receipt',
  'acknowledgment',
  'appraisal',
  'form_8283',
  'schedule_a',
  'summary_report',
  'other',
]);

export const dafStatusSchema = z.enum([
  'contributed',
  'granted',
  'partially_granted',
]);

/**
 * Schema for creating a tax profile
 */
export const createTaxProfileSchema = z.object({
  portfolio_id: z.string().uuid(),
  tax_year: z.number().int().min(2000).max(2100),
  filing_status: filingStatusSchema.optional().nullable(),
  estimated_agi: z.number().nonnegative().optional().nullable(),
  carryforward_from_prior: z.number().nonnegative().default(0).optional(),
});

/**
 * Schema for updating a tax profile
 */
export const updateTaxProfileSchema = createTaxProfileSchema.partial().omit({
  portfolio_id: true,
});

/**
 * EIN validation helper (format: XX-XXXXXXX)
 */
const einRegex = /^\d{2}-\d{7}$/;
export const einSchema = z
  .string()
  .regex(einRegex, 'EIN must be in format XX-XXXXXXX')
  .optional()
  .nullable();

/**
 * Base schema for tax contribution fields
 */
const baseTaxContributionSchema = z.object({
  portfolio_id: z.string().uuid(),
  holding_id: z.string().uuid().optional().nullable(),
  holding_contribution_id: z.string().uuid().optional().nullable(),
  tax_year: z.number().int().min(2000).max(2100),
  contribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),

  // Recipient information
  recipient_name: z.string().min(1, 'Recipient name is required').max(255),
  recipient_ein: einSchema,
  recipient_type: recipientTypeSchema.optional().nullable(),
  is_qualified_organization: z.boolean().default(true).optional(),

  // Contribution details
  contribution_type: contributionTypeSchema,
  amount_usd: z.number().positive('Amount must be positive'),
  fmv_at_donation: z.number().nonnegative().optional().nullable(),
  cost_basis: z.number().nonnegative().optional().nullable(),
  date_acquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  property_description: z.string().max(1000).optional().nullable(),

  // Substantiation
  receipt_storage_path: z.string().max(500).optional().nullable(),
  acknowledgment_received: z.boolean().default(false).optional(),
  acknowledgment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  acknowledgment_storage_path: z.string().max(500).optional().nullable(),
  quid_pro_quo_value: z.number().nonnegative().default(0).optional(),

  // Appraisal
  requires_appraisal: z.boolean().default(false).optional(),
  appraisal_storage_path: z.string().max(500).optional().nullable(),
  appraisal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  appraisal_value: z.number().nonnegative().optional().nullable(),
  appraiser_name: z.string().max(255).optional().nullable(),
  appraiser_tin: z.string().max(20).optional().nullable(),

  // QCD (Qualified Charitable Distribution)
  qcd_qualified: z.boolean().default(false).optional(),

  // Deduction tracking
  deductible_amount: z.number().nonnegative().optional().nullable(),
  applied_to_tax_year: z.number().int().optional().nullable(),
  agi_limit_category: agiLimitCategorySchema.optional().nullable(),

  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema for creating a tax contribution
 */
export const createTaxContributionSchema = baseTaxContributionSchema.refine(
  (data) => {
    // For non-cash contributions, require FMV if amount > $500
    if (
      !['cash', 'check', 'wire'].includes(data.contribution_type) &&
      data.amount_usd > 500
    ) {
      return data.fmv_at_donation !== null && data.fmv_at_donation !== undefined;
    }
    return true;
  },
  {
    message: 'Fair market value required for non-cash contributions over $500',
    path: ['fmv_at_donation'],
  }
).refine(
  (data) => {
    // For contributions > $5,000, require appraisal
    if (
      !['cash', 'check', 'wire'].includes(data.contribution_type) &&
      data.amount_usd > 5000
    ) {
      return data.requires_appraisal === true;
    }
    return true;
  },
  {
    message: 'Appraisal required for non-cash contributions over $5,000',
    path: ['requires_appraisal'],
  }
).refine(
  (data) => {
    // QCDs can only be cash contributions (from IRA)
    if (data.qcd_qualified) {
      return ['cash', 'check', 'wire'].includes(data.contribution_type);
    }
    return true;
  },
  {
    message: 'Qualified Charitable Distributions (QCDs) must be cash contributions from IRA',
    path: ['qcd_qualified'],
  }
);

/**
 * Schema for updating a tax contribution
 */
export const updateTaxContributionSchema = baseTaxContributionSchema
  .partial()
  .omit({ portfolio_id: true });

/**
 * Base schema for tax carryforward fields
 */
const baseTaxCarryforwardSchema = z.object({
  portfolio_id: z.string().uuid(),
  tax_contribution_id: z.string().uuid().optional().nullable(),
  originating_tax_year: z.number().int().min(2000).max(2100),
  amount: z.number().positive('Amount must be positive'),
  amount_remaining: z.number().nonnegative(),
  agi_limit_category: agiLimitCategorySchema,
  expires_tax_year: z.number().int().min(2000).max(2100),
  recipient_name: z.string().max(255).optional().nullable(),
  recipient_ein: einSchema,
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for creating a tax carryforward
 */
export const createTaxCarryforwardSchema = baseTaxCarryforwardSchema.refine(
  (data) => data.amount_remaining <= data.amount,
  {
    message: 'Remaining amount cannot exceed original amount',
    path: ['amount_remaining'],
  }
).refine(
  (data) => data.expires_tax_year >= data.originating_tax_year,
  {
    message: 'Expiration year must be after or equal to originating year',
    path: ['expires_tax_year'],
  }
);

/**
 * Schema for updating a tax carryforward
 */
export const updateTaxCarryforwardSchema = baseTaxCarryforwardSchema
  .partial()
  .omit({ portfolio_id: true });

/**
 * Schema for creating a DAF grant
 */
export const createDAFGrantSchema = z.object({
  portfolio_id: z.string().uuid(),
  daf_name: z.string().min(1, 'DAF name is required').max(255),
  daf_account_number: z.string().max(100).optional().nullable(),

  // Contribution to DAF
  contribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  contribution_amount: z.number().positive('Amount must be positive'),
  contribution_type: z.enum(['cash', 'stock', 'crypto', 'other']).optional().nullable(),
  tax_contribution_id: z.string().uuid().optional().nullable(),

  // Grant from DAF
  grant_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  grant_recipient: z.string().max(255).optional().nullable(),
  grant_recipient_ein: einSchema,
  grant_amount: z.number().positive().optional().nullable(),
  holding_id: z.string().uuid().optional().nullable(),

  status: dafStatusSchema.default('contributed').optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema for updating a DAF grant
 */
export const updateDAFGrantSchema = createDAFGrantSchema
  .partial()
  .omit({ portfolio_id: true });

/**
 * Schema for creating foundation 990-PF data
 */
export const createFoundation990PFSchema = z.object({
  portfolio_id: z.string().uuid(),
  tax_year: z.number().int().min(2000).max(2100),

  // Excise tax
  net_investment_income: z.number().nonnegative().default(0).optional(),
  excise_tax_rate: z.number().min(0).max(100).default(1.39).optional(),
  excise_tax_amount: z.number().nonnegative().optional().nullable(),

  // Minimum distribution (5% payout)
  fair_market_value_assets: z.number().nonnegative().optional().nullable(),
  required_payout: z.number().nonnegative().optional().nullable(),
  actual_payout: z.number().nonnegative().optional().nullable(),
  payout_deficit: z.number().default(0).optional(),

  // Self-dealing
  has_self_dealing: z.boolean().default(false).optional(),
  self_dealing_notes: z.string().max(2000).optional().nullable(),

  // Additional metrics
  total_grants: z.number().nonnegative().default(0).optional(),
  total_expenses: z.number().nonnegative().default(0).optional(),
});

/**
 * Schema for updating foundation 990-PF data
 */
export const updateFoundation990PFSchema = createFoundation990PFSchema
  .partial()
  .omit({ portfolio_id: true });

/**
 * Schema for tax document metadata
 */
export const createTaxDocumentSchema = z.object({
  portfolio_id: z.string().uuid(),
  tax_contribution_id: z.string().uuid().optional().nullable(),
  tax_year: z.number().int().min(2000).max(2100),
  document_type: documentTypeSchema,
  storage_path: z.string().min(1, 'Storage path is required').max(500),
  file_name: z.string().min(1, 'File name is required').max(255),
  file_size_bytes: z.number().int().nonnegative().optional().nullable(),
  mime_type: z.string().max(100).optional().nullable(),
  generated_by_system: z.boolean().default(false).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Schema for updating tax document metadata
 */
export const updateTaxDocumentSchema = createTaxDocumentSchema
  .partial()
  .omit({ portfolio_id: true });

/**
 * Query parameter schemas
 */
export const taxYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const agiCalculationQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  agi: z.coerce.number().nonnegative().optional(),
});

/**
 * Schema for charity verification lookup
 */
export const charityVerificationSchema = z.object({
  ein: z.string().regex(einRegex, 'EIN must be in format XX-XXXXXXX'),
});

export const charitySearchSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters').max(255),
  limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
});

/**
 * Type exports for use in components and API routes
 */
export type FilingStatus = z.infer<typeof filingStatusSchema>;
export type RecipientType = z.infer<typeof recipientTypeSchema>;
export type ContributionType = z.infer<typeof contributionTypeSchema>;
export type AGILimitCategory = z.infer<typeof agiLimitCategorySchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DAFStatus = z.infer<typeof dafStatusSchema>;

export type CreateTaxProfile = z.infer<typeof createTaxProfileSchema>;
export type UpdateTaxProfile = z.infer<typeof updateTaxProfileSchema>;
export type CreateTaxContribution = z.infer<typeof createTaxContributionSchema>;
export type UpdateTaxContribution = z.infer<typeof updateTaxContributionSchema>;
export type CreateTaxCarryforward = z.infer<typeof createTaxCarryforwardSchema>;
export type UpdateTaxCarryforward = z.infer<typeof updateTaxCarryforwardSchema>;
export type CreateDAFGrant = z.infer<typeof createDAFGrantSchema>;
export type UpdateDAFGrant = z.infer<typeof updateDAFGrantSchema>;
export type CreateFoundation990PF = z.infer<typeof createFoundation990PFSchema>;
export type UpdateFoundation990PF = z.infer<typeof updateFoundation990PFSchema>;
export type CreateTaxDocument = z.infer<typeof createTaxDocumentSchema>;
export type UpdateTaxDocument = z.infer<typeof updateTaxDocumentSchema>;

/**
 * Phase 1 Enhancement: Donor Profiles & Tax Years
 */

// Update filing status schema to match database
export const donorFilingStatusSchema = z.enum([
  'single',
  'married_filing_jointly',
  'married_filing_separately',
  'head_of_household',
  'qualifying_widow',
]);

export type DonorFilingStatus = z.infer<typeof donorFilingStatusSchema>;

export const DONOR_FILING_STATUS_LABELS: Record<DonorFilingStatus, string> = {
  single: 'Single',
  married_filing_jointly: 'Married Filing Jointly',
  married_filing_separately: 'Married Filing Separately',
  head_of_household: 'Head of Household',
  qualifying_widow: 'Qualifying Widow(er)',
};

/**
 * Donor Profile Schema
 */
export const donorProfileSchema = z.object({
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  filing_status: donorFilingStatusSchema.optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createDonorProfileSchema = donorProfileSchema;
export const updateDonorProfileSchema = donorProfileSchema.partial();

export type DonorProfile = z.infer<typeof donorProfileSchema> & {
  id: string;
  portfolio_id: string;
  age_as_of_date?: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Tax Year Schema (with AGI tracking)
 */
export const taxYearDetailSchema = z.object({
  tax_year: z.number().int().min(1900).max(2100),
  adjusted_gross_income: z.number().nonnegative().optional().nullable(),
  filing_status: donorFilingStatusSchema.optional().nullable(),
  standard_deduction: z.number().nonnegative().optional().nullable(),
  amt_exposure: z.boolean().optional().nullable(),
  amt_notes: z.string().max(1000).optional().nullable(),
  carryforward_from_prior_years: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createTaxYearDetailSchema = taxYearDetailSchema;
export const updateTaxYearDetailSchema = taxYearDetailSchema.partial().omit({ tax_year: true });

export type TaxYearDetail = z.infer<typeof taxYearDetailSchema> & {
  id: string;
  portfolio_id: string;
  agi_limit_60_pct?: number | null;
  agi_limit_50_pct?: number | null;
  agi_limit_30_pct?: number | null;
  agi_limit_20_pct?: number | null;
  total_contributions_60_pct?: number | null;
  total_contributions_50_pct?: number | null;
  total_contributions_30_pct?: number | null;
  total_contributions_20_pct?: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Tax Contribution with Limits (from view)
 */
export interface TaxContributionWithLimits {
  id: string;
  portfolio_id: string;
  holding_id?: string | null;
  tax_year: number;
  contribution_date: string;
  recipient_name: string;
  recipient_ein?: string | null;
  recipient_type?: string | null;
  contribution_type: string;
  amount_usd: number;
  cost_basis?: number | null;
  fmv_at_donation?: number | null;
  original_deductible_amount?: number | null;
  agi_limit_percentage?: number | null;
  carryforward_eligible?: boolean | null;
  carryforward_years?: number | null;

  // Calculated from AGI
  agi?: number | null;
  filing_status?: string | null;
  agi_limit_amount?: number | null;
  deductible_this_year?: number | null;
  excess_for_carryforward?: number | null;
  within_agi_limit?: boolean | null;
  capital_gains_avoided?: number | null;
  estimated_tax_savings?: number | null;
  qcd_tax_benefit?: number | null;

  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Portfolio Tax Summary (from view)
 */
export interface PortfolioTaxSummary {
  portfolio_id: string;
  tax_year: number;
  agi?: number | null;
  filing_status?: string | null;
  standard_deduction?: number | null;

  agi_limit_60_pct?: number | null;
  agi_limit_50_pct?: number | null;
  agi_limit_30_pct?: number | null;
  agi_limit_20_pct?: number | null;

  total_contributions_count?: number;
  total_contributed?: number | null;
  contributed_60_pct?: number | null;
  contributed_50_pct?: number | null;
  contributed_30_pct?: number | null;
  contributed_20_pct?: number | null;

  total_deductible_this_year?: number | null;
  total_excess_carryforward?: number | null;
  total_capital_gains_avoided?: number | null;

  total_qcd_amount?: number | null;
  qcd_count?: number;

  utilization_60_pct?: number | null;
  utilization_30_pct?: number | null;

  carryforward_from_prior_years?: number | null;

  remaining_capacity_60_pct?: number | null;
  remaining_capacity_30_pct?: number | null;

  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Donation Capacity
 */
export interface DonationCapacity {
  tax_year: number;
  agi?: number | null;
  limit_60_pct?: number | null;
  used_60_pct?: number | null;
  remaining_60_pct?: number | null;
  limit_30_pct?: number | null;
  used_30_pct?: number | null;
  remaining_30_pct?: number | null;
  limit_20_pct?: number | null;
  used_20_pct?: number | null;
  remaining_20_pct?: number | null;
  limit_50_pct?: number | null;
  used_50_pct?: number | null;
  remaining_50_pct?: number | null;
}

/**
 * Standard Deduction Amounts by Year
 * Source: IRS Revenue Procedures and One Big Beautiful Bill Act (2025)
 */
export const STANDARD_DEDUCTIONS: Record<number, Record<DonorFilingStatus, number>> = {
  2026: {
    single: 16100,
    married_filing_jointly: 32200,
    married_filing_separately: 16100,
    head_of_household: 24150,
    qualifying_widow: 32200,
  },
  2025: {
    single: 15750,
    married_filing_jointly: 31500,
    married_filing_separately: 15750,
    head_of_household: 23625,
    qualifying_widow: 31500,
  },
  2024: {
    single: 14600,
    married_filing_jointly: 29200,
    married_filing_separately: 14600,
    head_of_household: 21900,
    qualifying_widow: 29200,
  },
  2023: {
    single: 13850,
    married_filing_jointly: 27700,
    married_filing_separately: 13850,
    head_of_household: 20800,
    qualifying_widow: 27700,
  },
};

// Backwards compatibility alias
export const STANDARD_DEDUCTIONS_2024 = STANDARD_DEDUCTIONS[2024];

/**
 * Helper: Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: string, asOfDate: string = new Date().toISOString()): number {
  const dob = new Date(dateOfBirth);
  const asOf = new Date(asOfDate);

  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

/**
 * Helper: Calculate precise age (with decimal for months)
 */
export function calculatePreciseAge(dateOfBirth: string, asOfDate: string = new Date().toISOString()): number {
  const dob = new Date(dateOfBirth);
  const asOf = new Date(asOfDate);

  const years = asOf.getFullYear() - dob.getFullYear();
  const months = asOf.getMonth() - dob.getMonth();
  const days = asOf.getDate() - dob.getDate();

  let totalMonths = years * 12 + months;
  if (days < 0) {
    totalMonths--;
  }

  return totalMonths / 12;
}

/**
 * Helper: Check if eligible for QCD
 */
export function isQCDEligible(dateOfBirth: string, contributionDate: string): {
  eligible: boolean;
  age: number;
  reason?: string;
} {
  const age = calculatePreciseAge(dateOfBirth, contributionDate);

  if (age < 70.5) {
    return {
      eligible: false,
      age,
      reason: `Age ${age.toFixed(1)} is below required 70.5`,
    };
  }

  return {
    eligible: true,
    age,
  };
}

/**
 * Helper: Get standard deduction for filing status and year
 */
export function getStandardDeduction(filingStatus: DonorFilingStatus, year: number = 2024): number {
  const yearData = STANDARD_DEDUCTIONS[year] || STANDARD_DEDUCTIONS[2026];
  return yearData[filingStatus];
}

/**
 * Helper: Calculate whether itemizing is beneficial
 */
export function shouldItemize(
  filingStatus: DonorFilingStatus,
  totalCharitableContributions: number,
  otherItemizedDeductions: number = 0,
  year: number = 2024
): {
  shouldItemize: boolean;
  standardDeduction: number;
  totalItemized: number;
  benefit: number;
} {
  const standardDeduction = getStandardDeduction(filingStatus, year);
  const totalItemized = totalCharitableContributions + otherItemizedDeductions;
  const benefit = totalItemized - standardDeduction;

  return {
    shouldItemize: totalItemized > standardDeduction,
    standardDeduction,
    totalItemized,
    benefit: Math.max(0, benefit),
  };
}

/**
 * QCD Annual Limits by Year
 * Starting 2024, indexed for inflation per SECURE 2.0 Act
 */
export const QCD_ANNUAL_LIMITS: Record<number, number> = {
  2026: 111000,
  2025: 108000,
  2024: 105000,
  2023: 100000,
};

/**
 * QCD Split-Interest Gift Limits by Year (one-time CRT/gift annuity)
 * Available starting 2024 per SECURE 2.0 Act
 */
export const QCD_SPLIT_INTEREST_LIMITS: Record<number, number> = {
  2026: 55000,
  2025: 54000,
  2024: 53000,
};

/**
 * Helper: Calculate QCD limit and available amount
 * Annual limit is indexed for inflation starting 2024
 */
export function calculateQCDLimit(
  year: number = 2024,
  filingStatus: DonorFilingStatus = 'single',
): {
  limit: number;
  perIndividual: number;
  splitInterestLimit: number;
} {
  // Get year-specific limit, default to most recent if not found
  const perIndividual = QCD_ANNUAL_LIMITS[year] || QCD_ANNUAL_LIMITS[2026];
  const splitInterestLimit = QCD_SPLIT_INTEREST_LIMITS[year] || 0;

  // For married filing jointly, each spouse has separate limit from their own IRA
  const limit = filingStatus === 'married_filing_jointly'
    ? perIndividual * 2
    : perIndividual;

  return { limit, perIndividual, splitInterestLimit };
}

/**
 * Helper: Calculate QCD tax benefit
 * QCDs reduce AGI directly (better than standard deduction)
 */
export function calculateQCDBenefit(
  qcdAmount: number,
  marginalTaxRate: number = 0.24, // Default 24% bracket
): {
  agiReduction: number;
  taxSavings: number;
  rmdSatisfied: number;
} {
  return {
    agiReduction: qcdAmount, // Full amount reduces AGI
    taxSavings: qcdAmount * marginalTaxRate, // Estimated tax savings
    rmdSatisfied: qcdAmount, // Counts toward RMD
  };
}

/**
 * Helper: Validate QCD eligibility and amount
 */
export function validateQCD(
  contribution: {
    qcd_qualified: boolean;
    contribution_type: string;
    amount_usd: number;
    contribution_date: string;
  },
  donorDateOfBirth?: string | null,
  yearToDateQCDs: number = 0,
  taxYear?: number,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!contribution.qcd_qualified) {
    return { valid: true, errors, warnings };
  }

  // Determine tax year from contribution date if not provided
  const year = taxYear || new Date(contribution.contribution_date).getFullYear();
  const yearLimit = QCD_ANNUAL_LIMITS[year] || QCD_ANNUAL_LIMITS[2026];

  // Check contribution type
  if (!['cash', 'check', 'wire'].includes(contribution.contribution_type)) {
    errors.push('QCDs must be cash contributions from IRA');
  }

  // Check age eligibility
  if (donorDateOfBirth) {
    const eligibility = isQCDEligible(donorDateOfBirth, contribution.contribution_date);
    if (!eligibility.eligible) {
      errors.push(eligibility.reason || 'Donor must be 70½ or older for QCDs');
    }
  } else {
    warnings.push('Cannot verify age eligibility without date of birth');
  }

  // Check annual limit (year-specific)
  const totalQCDs = yearToDateQCDs + contribution.amount_usd;
  if (totalQCDs > yearLimit) {
    errors.push(`QCD limit exceeded: $${totalQCDs.toLocaleString()} (${year} limit: $${yearLimit.toLocaleString()}/year)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
