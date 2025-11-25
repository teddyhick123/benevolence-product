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
