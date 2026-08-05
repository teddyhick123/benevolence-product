/**
 * Compliance & Regulatory — Input Validation Tests
 *
 * Validates the shape and constraints expected by the AI tool executors
 * and API routes. These mirror the portfolio assistant executor validation.
 * and the API route body parsing, giving a fast regression layer without
 * needing a live database.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Inline Zod schemas (parallel to AI tool required/optional fields) ────────

const UUID = z.string().uuid();

const entityTypeEnum = z.enum(['private_foundation', 'public_charity', 'daf_sponsor']);
const foundationClassificationEnum = z.enum(['operating', 'non_operating', 'conduit', 'exempt_operating']);
const filingTypeEnum = z.enum([
  '990_pf', '990', '990_ez', '990_n', '990_t',
  'state_annual_report', 'state_registration', 'state_renewal', 'state_990_copy',
  'form_4720', 'form_5227', 'form_8868', 'other',
]);
const filingStatusEnum = z.enum([
  'pending', 'in_progress', 'filed', 'filed_late', 'extended', 'overdue', 'not_required',
]);
const relationshipTypeEnum = z.enum([
  'founder', 'substantial_contributor', 'foundation_manager', 'twenty_pct_owner',
  'family_member', 'thirty_five_pct_owned_entity', 'government_official',
]);
const qualifyingDistributionCategoryEnum = z.enum([
  'grants_paid', 'grants_paid_er', 'program_expenses', 'admin_expenses',
  'set_aside', 'program_related_investment', 'operating_foundation_expenditure',
]);
const selfDealingTransactionTypeEnum = z.enum([
  'sale_or_exchange', 'loan_or_extension_of_credit', 'furnishing_goods_services',
  'payment_of_compensation', 'transfer_or_use_of_assets', 'agreement_to_pay_money',
  'indirect_self_dealing',
]);
const erStatusEnum = z.enum(['pending', 'compliant', 'deficient', 'waived']);
const stateRegistrationStatusEnum = z.enum([
  'registered', 'renewal_pending', 'renewal_overdue', 'exempt',
  'not_registered', 'lapsed', 'rejected',
]);

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const taxYear = z.number().int().min(1990).max(2100);

// ─── compliance_profiles body ────────────────────────────────────────────────

const complianceProfileSchema = z.object({
  entity_type: entityTypeEnum,
  foundation_classification: foundationClassificationEnum.optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).default(12),
  ein_confirmed: z.boolean().default(false),
  irs_determination_date: dateString.optional().nullable(),
  public_support_test: z.enum(['509a1', '509a2', '509a3']).optional().nullable(),
  daf_distribution_policy_pct: z.number().min(0).max(100).optional().nullable(),
  is_foreign_private_foundation: z.boolean().default(false),
  operates_in_multiple_states: z.boolean().default(false),
});

describe('complianceProfileSchema', () => {
  it('accepts a minimal private_foundation profile', () => {
    const result = complianceProfileSchema.safeParse({ entity_type: 'private_foundation' });
    expect(result.success).toBe(true);
  });

  it('accepts all entity types', () => {
    for (const type of ['private_foundation', 'public_charity', 'daf_sponsor'] as const) {
      expect(complianceProfileSchema.safeParse({ entity_type: type }).success).toBe(true);
    }
  });

  it('rejects invalid entity_type', () => {
    expect(complianceProfileSchema.safeParse({ entity_type: 'llc' }).success).toBe(false);
  });

  it('rejects fiscal_year_end_month outside 1–12', () => {
    expect(complianceProfileSchema.safeParse({ entity_type: 'public_charity', fiscal_year_end_month: 13 }).success).toBe(false);
    expect(complianceProfileSchema.safeParse({ entity_type: 'public_charity', fiscal_year_end_month: 0 }).success).toBe(false);
  });

  it('accepts valid public_support_test values', () => {
    for (const val of ['509a1', '509a2', '509a3'] as const) {
      const result = complianceProfileSchema.safeParse({ entity_type: 'public_charity', public_support_test: val });
      expect(result.success).toBe(true);
    }
  });
});

// ─── disqualified_persons body ────────────────────────────────────────────────

const disqualifiedPersonSchema = z.object({
  organization_id: UUID,
  full_name: z.string().min(1).max(500),
  relationship_type: relationshipTypeEnum,
  title_or_role: z.string().optional().nullable(),
  ein: z.string().optional().nullable(),
  ssn_last4: z.string().length(4).regex(/^\d{4}$/).optional().nullable(),
  related_to_person_id: UUID.optional().nullable(),
  start_date: dateString.optional(),
  notes: z.string().optional().nullable(),
});

const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('disqualifiedPersonSchema', () => {
  const valid = {
    organization_id: TEST_UUID,
    full_name: 'Jane Smith',
    relationship_type: 'founder',
  };

  it('accepts minimal required fields', () => {
    expect(disqualifiedPersonSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all relationship types', () => {
    for (const rel of ['founder', 'substantial_contributor', 'foundation_manager',
      'twenty_pct_owner', 'family_member', 'thirty_five_pct_owned_entity', 'government_official'] as const) {
      expect(disqualifiedPersonSchema.safeParse({ ...valid, relationship_type: rel }).success).toBe(true);
    }
  });

  it('rejects invalid UUID for organization_id', () => {
    expect(disqualifiedPersonSchema.safeParse({ ...valid, organization_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects empty full_name', () => {
    expect(disqualifiedPersonSchema.safeParse({ ...valid, full_name: '' }).success).toBe(false);
  });

  it('rejects ssn_last4 that is not exactly 4 digits', () => {
    expect(disqualifiedPersonSchema.safeParse({ ...valid, ssn_last4: '123' }).success).toBe(false);
    expect(disqualifiedPersonSchema.safeParse({ ...valid, ssn_last4: '12345' }).success).toBe(false);
    expect(disqualifiedPersonSchema.safeParse({ ...valid, ssn_last4: 'abcd' }).success).toBe(false);
  });

  it('accepts valid ssn_last4', () => {
    expect(disqualifiedPersonSchema.safeParse({ ...valid, ssn_last4: '1234' }).success).toBe(true);
  });

  it('rejects invalid relationship_type', () => {
    expect(disqualifiedPersonSchema.safeParse({ ...valid, relationship_type: 'donor' }).success).toBe(false);
  });
});

// ─── filing_calendar body ─────────────────────────────────────────────────────

const filingCalendarCreateSchema = z.object({
  organization_id: UUID,
  filing_type: filingTypeEnum,
  tax_year: taxYear,
  jurisdiction: z.string().default('federal'),
  due_date: dateString,
  extended_due_date: dateString.optional().nullable(),
  status: filingStatusEnum.default('pending'),
  description: z.string().optional().nullable(),
});

describe('filingCalendarCreateSchema', () => {
  const valid = {
    organization_id: TEST_UUID,
    filing_type: '990_pf',
    tax_year: 2025,
    due_date: '2025-11-15',
  };

  it('accepts valid 990-PF deadline', () => {
    expect(filingCalendarCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all filing types', () => {
    const allTypes = [
      '990_pf', '990', '990_ez', '990_n', '990_t', 'state_annual_report',
      'state_registration', 'state_renewal', 'state_990_copy',
      'form_4720', 'form_5227', 'form_8868', 'other',
    ];
    for (const type of allTypes) {
      expect(filingCalendarCreateSchema.safeParse({ ...valid, filing_type: type }).success).toBe(true);
    }
  });

  it('rejects invalid due_date format', () => {
    expect(filingCalendarCreateSchema.safeParse({ ...valid, due_date: '11/15/2025' }).success).toBe(false);
    expect(filingCalendarCreateSchema.safeParse({ ...valid, due_date: '2025-13-01' }).success).toBe(true); // regex passes, semantic check is DB-level
  });

  it('rejects tax_year before 1990', () => {
    expect(filingCalendarCreateSchema.safeParse({ ...valid, tax_year: 1989 }).success).toBe(false);
  });

  it('rejects tax_year after 2100', () => {
    expect(filingCalendarCreateSchema.safeParse({ ...valid, tax_year: 2101 }).success).toBe(false);
  });

  it('defaults status to pending', () => {
    const result = filingCalendarCreateSchema.safeParse(valid);
    if (result.success) {
      expect(result.data.status).toBe('pending');
    }
  });

  it('accepts extension with extended_due_date', () => {
    expect(filingCalendarCreateSchema.safeParse({
      ...valid,
      status: 'extended',
      extended_due_date: '2026-02-15',
    }).success).toBe(true);
  });
});

// ─── qualifying_distributions body ───────────────────────────────────────────

const qualifyingDistributionSchema = z.object({
  portfolio_id: UUID,
  tax_year: taxYear,
  category: qualifyingDistributionCategoryEnum,
  description: z.string().min(1),
  gross_amount: z.number().min(0),
  qualifying_amount: z.number().min(0),
  distribution_date: dateString,
  grant_payment_id: UUID.optional().nullable(),
  holding_id: UUID.optional().nullable(),
  approved_by_board: z.boolean().default(false),
  board_approval_date: dateString.optional().nullable(),
});

describe('qualifyingDistributionSchema', () => {
  const valid = {
    portfolio_id: TEST_UUID,
    tax_year: 2025,
    category: 'grants_paid',
    description: 'Grant to Community Foundation',
    gross_amount: 50_000,
    qualifying_amount: 50_000,
    distribution_date: '2025-06-15',
  };

  it('accepts a valid grant distribution', () => {
    expect(qualifyingDistributionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all distribution categories', () => {
    const cats = [
      'grants_paid', 'grants_paid_er', 'program_expenses', 'admin_expenses',
      'set_aside', 'program_related_investment', 'operating_foundation_expenditure',
    ];
    for (const cat of cats) {
      expect(qualifyingDistributionSchema.safeParse({ ...valid, category: cat }).success).toBe(true);
    }
  });

  it('rejects negative gross_amount', () => {
    expect(qualifyingDistributionSchema.safeParse({ ...valid, gross_amount: -100 }).success).toBe(false);
  });

  it('rejects negative qualifying_amount', () => {
    expect(qualifyingDistributionSchema.safeParse({ ...valid, qualifying_amount: -1 }).success).toBe(false);
  });

  it('rejects empty description', () => {
    expect(qualifyingDistributionSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
  });

  it('allows qualifying_amount less than gross_amount (partial qualifying)', () => {
    // Admin expenses: only a portion may qualify
    const result = qualifyingDistributionSchema.safeParse({
      ...valid,
      category: 'admin_expenses',
      gross_amount: 100_000,
      qualifying_amount: 40_000,
    });
    expect(result.success).toBe(true);
  });
});

// ─── self_dealing_incidents body ──────────────────────────────────────────────

const selfDealingIncidentSchema = z.object({
  organization_id: UUID,
  disqualified_person_name: z.string().min(1),
  incident_date: dateString,
  transaction_type: selfDealingTransactionTypeEnum,
  amount: z.number().min(0).optional().nullable(),
  description: z.string().min(1),
  grant_id: UUID.optional().nullable(),
  status: z.enum(['flagged', 'cleared', 'confirmed', 'corrected', 'excise_tax_assessed']).default('flagged'),
  ai_flagged: z.boolean().default(false),
});

describe('selfDealingIncidentSchema', () => {
  const valid = {
    organization_id: TEST_UUID,
    disqualified_person_name: 'Jane Smith',
    incident_date: '2025-03-01',
    transaction_type: 'sale_or_exchange',
    description: 'Sale of property to founder',
  };

  it('accepts valid incident', () => {
    expect(selfDealingIncidentSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all transaction types', () => {
    const types = [
      'sale_or_exchange', 'loan_or_extension_of_credit', 'furnishing_goods_services',
      'payment_of_compensation', 'transfer_or_use_of_assets', 'agreement_to_pay_money',
      'indirect_self_dealing',
    ];
    for (const type of types) {
      expect(selfDealingIncidentSchema.safeParse({ ...valid, transaction_type: type }).success).toBe(true);
    }
  });

  it('defaults status to flagged', () => {
    const result = selfDealingIncidentSchema.safeParse(valid);
    if (result.success) expect(result.data.status).toBe('flagged');
  });

  it('rejects negative amount', () => {
    expect(selfDealingIncidentSchema.safeParse({ ...valid, amount: -500 }).success).toBe(false);
  });

  it('accepts null amount (transaction amount unknown)', () => {
    expect(selfDealingIncidentSchema.safeParse({ ...valid, amount: null }).success).toBe(true);
  });
});

// ─── state_registrations body ─────────────────────────────────────────────────

const stateRegistrationSchema = z.object({
  organization_id: UUID,
  state_code: z.string().length(2).regex(/^[A-Z]{2}$/),
  state_name: z.string().min(1),
  registration_number: z.string().optional().nullable(),
  status: stateRegistrationStatusEnum,
  registration_date: dateString.optional().nullable(),
  expiration_date: dateString.optional().nullable(),
  annual_report_due: dateString.optional().nullable(),
  solicits_in_state: z.boolean().default(false),
});

describe('stateRegistrationSchema', () => {
  const valid = {
    organization_id: TEST_UUID,
    state_code: 'CA',
    state_name: 'California',
    status: 'registered',
  };

  it('accepts valid California registration', () => {
    expect(stateRegistrationSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects lowercase state_code', () => {
    expect(stateRegistrationSchema.safeParse({ ...valid, state_code: 'ca' }).success).toBe(false);
  });

  it('rejects state_code longer than 2 characters', () => {
    expect(stateRegistrationSchema.safeParse({ ...valid, state_code: 'CAL' }).success).toBe(false);
  });

  it('accepts all status values', () => {
    const statuses = [
      'registered', 'renewal_pending', 'renewal_overdue', 'exempt',
      'not_registered', 'lapsed', 'rejected',
    ];
    for (const status of statuses) {
      expect(stateRegistrationSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });

  it('rejects empty state_name', () => {
    expect(stateRegistrationSchema.safeParse({ ...valid, state_name: '' }).success).toBe(false);
  });
});

// ─── expenditure_responsibility_grants body ────────────────────────────────

const erGrantSchema = z.object({
  portfolio_id: UUID,
  grant_id: UUID,
  grantee_is_public_charity: z.boolean().default(false),
  grantee_ein: z.string().optional().nullable(),
  grantee_501c3_verified: z.boolean().default(false),
  er_reports_required_count: z.number().int().min(0).default(0),
  er_reports_received_count: z.number().int().min(0).default(0),
  terminal_report_required: z.boolean().default(true),
  terminal_report_received: z.boolean().default(false),
  er_status: erStatusEnum.default('pending'),
});

describe('erGrantSchema', () => {
  const valid = {
    portfolio_id: TEST_UUID,
    grant_id: '660e8400-e29b-41d4-a716-446655440001',
  };

  it('accepts minimal ER record', () => {
    expect(erGrantSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects negative report counts', () => {
    expect(erGrantSchema.safeParse({ ...valid, er_reports_required_count: -1 }).success).toBe(false);
    expect(erGrantSchema.safeParse({ ...valid, er_reports_received_count: -1 }).success).toBe(false);
  });

  it('accepts all er_status values', () => {
    for (const status of ['pending', 'compliant', 'deficient', 'waived'] as const) {
      expect(erGrantSchema.safeParse({ ...valid, er_status: status }).success).toBe(true);
    }
  });

  it('rejects invalid er_status', () => {
    expect(erGrantSchema.safeParse({ ...valid, er_status: 'unknown' }).success).toBe(false);
  });
});
