/**
 * Tax Constants
 *
 * IRS standard deduction amounts and other tax-related constants.
 * These should be updated annually as IRS publishes new figures.
 */

import type { FilingStatus } from '@/lib/schemas/tax';

/**
 * Standard deduction amounts by year and filing status
 */
export const STANDARD_DEDUCTION: Record<
  number,
  Record<FilingStatus, number>
> = {
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
 * Get standard deduction for a given year and filing status
 * Falls back to 2024 values if year not found
 */
export function getStandardDeduction(
  year: number,
  filingStatus: FilingStatus
): number {
  const yearData = STANDARD_DEDUCTION[year] || STANDARD_DEDUCTION[2024];
  return yearData[filingStatus];
}

/**
 * AGI limit percentages for charitable contributions
 */
export const AGI_LIMIT_PERCENTAGES = {
  CASH_PUBLIC_CHARITY: 0.60, // 60% of AGI
  APPRECIATED_ASSETS_PUBLIC: 0.30, // 30% of AGI
  CASH_PRIVATE_FOUNDATION: 0.30, // 30% of AGI
  PROPERTY_PRIVATE_FOUNDATION: 0.20, // 20% of AGI
} as const;

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
 */
export const FOUNDATION_EXCISE_TAX = {
  STANDARD_RATE: 1.39, // 1.39% on net investment income
  HIGHER_RATE: 2.0, // 2% if payout < average of prior 5 years
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
