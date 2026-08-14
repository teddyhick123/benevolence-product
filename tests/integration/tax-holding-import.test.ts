// @vitest-environment node
// tests/integration/tax-holding-import.test.ts
// Contract / source-level tests for the holding-to-tax-contribution flow.
// Tests the route source and helper logic without a live DB.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createTaxContributionDraft,
  suggestContributionType,
  ASSET_TYPE_TO_CONTRIBUTION_TYPE,
  CONTRIBUTION_TYPE_LABELS,
  isContributionTypeValid,
  type ContributionType,
} from '@/lib/helpers/tax-holding-link';

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

const routeSrc = read('app/api/holdings/[id]/create-tax-record/route.ts');
const taxContributionsRouteSrc = read('app/api/portfolio/[id]/tax/contributions/route.ts');
const holdingsImporterSrc = read('components/tax/HoldingsImporter.tsx');
const helperSrc = read('lib/helpers/tax-holding-link.ts');

// ---------------------------------------------------------------------------
// 1. Route: authorization contract
// ---------------------------------------------------------------------------
describe('create-tax-record route: authorization contract', () => {
  it('uses can_edit_portfolio RPC (not direct portfolio_members role check)', () => {
    expect(routeSrc).toContain("rpc('can_edit_portfolio'");
    expect(routeSrc).not.toContain("from('portfolio_members')");
  });

  it('returns 401 when unauthenticated', () => {
    expect(routeSrc).toContain("status: 401");
  });

  it('returns 403 when edit permission denied', () => {
    expect(routeSrc).toContain("status: 403");
  });

  it('does not check portfolio_members.role directly', () => {
    // Old pattern: ['owner', 'editor'].includes(member.role)
    expect(routeSrc).not.toContain("'owner'");
    expect(routeSrc).not.toContain("'editor'");
  });
});

// ---------------------------------------------------------------------------
// 2. Route: canonical schema compliance
// ---------------------------------------------------------------------------
describe('create-tax-record route: canonical schema columns', () => {
  it('writes contribution_date (not donation_date as an insert key)', () => {
    expect(routeSrc).toContain('contribution_date');
    // donation_date must not appear as an insert key (object property in the insert call)
    expect(routeSrc).not.toMatch(/donation_date\s*:/);
  });

  it('writes tax_year (not deduction_year as an insert key)', () => {
    expect(routeSrc).toContain('tax_year');
    // deduction_year must not appear as an insert key
    expect(routeSrc).not.toMatch(/deduction_year\s*:/);
  });

  it('uses the canonical tax_year produced by the holding tax helper', () => {
    expect(routeSrc).toContain('tax_year: draft.tax_year');
  });

  it('inserts portfolio_id', () => {
    expect(routeSrc).toContain('portfolio_id: holding.portfolio_id');
  });

  it('inserts holding_id', () => {
    expect(routeSrc).toContain('holding_id: draft.holding_id');
  });

  it('inserts contribution_type', () => {
    expect(routeSrc).toContain('contribution_type: draft.contribution_type');
  });

  it('inserts amount_usd', () => {
    expect(routeSrc).toContain('amount_usd: draft.amount_usd');
  });

  it('inserts fmv_at_donation', () => {
    expect(routeSrc).toContain('fmv_at_donation');
  });

  it('inserts cost_basis', () => {
    expect(routeSrc).toContain('cost_basis');
  });

  it('inserts recipient_name', () => {
    expect(routeSrc).toContain('recipient_name');
  });

  it('inserts property_description', () => {
    expect(routeSrc).toContain('property_description');
  });

  it('preserves QCD treatment on insert', () => {
    expect(routeSrc).toContain('qcd_qualified: draft.qcd_qualified ?? false');
  });

  it('inserts notes', () => {
    expect(routeSrc).toContain('notes');
  });
});

describe('Tax Center holding importer: QCD passthrough contract', () => {
  it('HoldingsImporter marks qcd_distribution rows as qcd_qualified', () => {
    expect(holdingsImporterSrc).toContain("holding.asset_type === 'qcd_distribution'");
    expect(holdingsImporterSrc).toContain('body.qcd_qualified = true');
  });

  it('tax contributions POST route persists qcd_qualified from validation', () => {
    expect(taxContributionsRouteSrc).toContain('qcd_qualified: validated.qcd_qualified ?? false');
  });
});

// ---------------------------------------------------------------------------
// 3. Route: duplicate protection uses maybeSingle()
// ---------------------------------------------------------------------------
describe('create-tax-record route: duplicate check', () => {
  it('uses maybeSingle() for duplicate check (not single())', () => {
    // Count occurrences — both POST and GET should use maybeSingle for the check
    const matches = routeSrc.match(/\.maybeSingle\(\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('does not use .single() for tax_contributions duplicate lookup', () => {
    // The only .single() usage allowed is on the final insert .select().single()
    // Ensure we don't have .single() right after a tax_contributions select for duplicate check
    const dupCheckPattern = /tax_contributions[\s\S]{0,200}\.single\(\)/;
    // Find duplicate check block specifically (before the insert)
    const postHandlerEnd = routeSrc.indexOf('// Insert canonical tax_contributions row');
    const preInsertSection = routeSrc.slice(0, postHandlerEnd > 0 ? postHandlerEnd : routeSrc.length);
    expect(preInsertSection).not.toMatch(/from\('tax_contributions'\)[\s\S]{0,200}\.single\(\)/);
  });

  it('returns 409 for duplicate holding', () => {
    expect(routeSrc).toContain("status: 409");
  });

  it('returns existing_id in the 409 response', () => {
    expect(routeSrc).toContain('existing_id');
  });
});

// ---------------------------------------------------------------------------
// 4. Helper: TaxContributionDraft uses canonical field names
// ---------------------------------------------------------------------------
describe('tax-holding-link helper: TaxContributionDraft interface', () => {
  it('exports contribution_date field (donation_date not an interface member)', () => {
    expect(helperSrc).toContain('contribution_date');
    // donation_date must not appear as a property declaration in the interface
    expect(helperSrc).not.toMatch(/donation_date\s*[?]?\s*:/);
  });

  it('exports tax_year field (deduction_year not an interface member)', () => {
    expect(helperSrc).toContain('tax_year');
    // deduction_year must not appear as a property declaration in the interface
    expect(helperSrc).not.toMatch(/deduction_year\s*[?]?\s*:/);
  });

  it('exports property_description field', () => {
    expect(helperSrc).toContain('property_description');
  });

  it('exports qcd_qualified field', () => {
    expect(helperSrc).toContain('qcd_qualified?: boolean');
  });
});

// ---------------------------------------------------------------------------
// 5. Helper: ContributionType matches canonical DB types only
// ---------------------------------------------------------------------------
describe('tax-holding-link helper: ContributionType is canonical', () => {
  it('does not include non-canonical ach type', () => {
    // ach is not in the DB CHECK constraint
    expect(helperSrc).not.toMatch(/'ach'/);
  });

  it('does not include non-canonical vehicle type', () => {
    expect(helperSrc).not.toMatch(/'vehicle'/);
  });

  it('does not include non-canonical art type', () => {
    // 'art' is not in DB CHECK — should not appear as a type value
    expect(helperSrc).not.toMatch(/'art'/);
  });

  it('does not include non-canonical other type (only other_property)', () => {
    // The bare 'other' contribution type is not in DB CHECK
    // It may appear in comments but should not be a standalone type string in the labels map
    expect(helperSrc).not.toContain("other: 'Other'");
  });

  it('CONTRIBUTION_TYPE_LABELS contains exactly the canonical 7 types', () => {
    const canonicalTypes: ContributionType[] = [
      'cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property',
    ];
    for (const type of canonicalTypes) {
      expect(CONTRIBUTION_TYPE_LABELS).toHaveProperty(type);
    }
    expect(Object.keys(CONTRIBUTION_TYPE_LABELS)).toHaveLength(canonicalTypes.length);
  });
});

// ---------------------------------------------------------------------------
// 6. Helper: createTaxContributionDraft — cash holding
// ---------------------------------------------------------------------------
describe('createTaxContributionDraft: cash holding', () => {
  const holding = {
    id: 'holding-uuid-cash',
    name: 'General Donation',
    asset_type: 'donation' as const,
    funds_allocated: 5000,
    created_at: '2025-03-15T10:00:00Z',
  };

  const draft = createTaxContributionDraft(holding);

  it('sets contribution_type to cash', () => {
    expect(draft.contribution_type).toBe('cash');
  });

  it('sets amount_usd from funds_allocated', () => {
    expect(draft.amount_usd).toBe(5000);
  });

  it('sets contribution_date to YYYY-MM-DD format', () => {
    expect(draft.contribution_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('derives tax_year from contribution_date', () => {
    const year = new Date(draft.contribution_date).getFullYear();
    expect(draft.tax_year).toBe(year);
  });

  it('does not include donation_date field', () => {
    expect(draft).not.toHaveProperty('donation_date');
  });

  it('does not include deduction_year field', () => {
    expect(draft).not.toHaveProperty('deduction_year');
  });

  it('sets recipient_name from holding name', () => {
    expect(draft.recipient_name).toBe('General Donation');
  });

  it('sets property_description', () => {
    expect(draft.property_description).toBeTruthy();
  });

  it('includes a notes string', () => {
    expect(typeof draft.notes).toBe('string');
    expect(draft.notes!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Helper: createTaxContributionDraft — stock (equity) holding
// ---------------------------------------------------------------------------
describe('createTaxContributionDraft: stock / equity holding', () => {
  const holding = {
    id: 'holding-uuid-stock',
    name: 'AAPL Shares',
    asset_type: 'equity_investment' as const,
    funds_allocated: 20000,
    created_at: '2024-07-01T00:00:00Z',
    cost_basis: 8000,
    current_nav: 22000,
  };

  const draft = createTaxContributionDraft(holding);

  it('sets contribution_type to stock', () => {
    expect(draft.contribution_type).toBe('stock');
  });

  it('sets cost_basis from holding data', () => {
    expect(draft.cost_basis).toBe(8000);
  });

  it('sets fmv_at_donation from current_nav', () => {
    expect(draft.fmv_at_donation).toBe(22000);
  });

  it('derives tax_year 2024 from created_at', () => {
    expect(draft.tax_year).toBe(2024);
  });

  it('does not have donation_date', () => {
    expect(draft).not.toHaveProperty('donation_date');
  });
});

// ---------------------------------------------------------------------------
// 8. Helper: createTaxContributionDraft — stock without provided cost basis/current value
// ---------------------------------------------------------------------------
describe('createTaxContributionDraft: equity holding with no external perf data', () => {
  const holding = {
    id: 'holding-uuid-equity-no-perf',
    name: 'Unlisted Equity',
    asset_type: 'equity_investment' as const,
    funds_allocated: 10000,
    created_at: '2023-12-01T00:00:00Z',
  };

  const draft = createTaxContributionDraft(holding);

  it('falls back to funds_allocated for cost_basis', () => {
    expect(draft.cost_basis).toBe(10000);
  });

  it('falls back to funds_allocated for fmv_at_donation', () => {
    expect(draft.fmv_at_donation).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// 9. Helper: createTaxContributionDraft — no created_at defaults to now
// ---------------------------------------------------------------------------
describe('createTaxContributionDraft: holding without created_at', () => {
  const currentYear = new Date().getFullYear();

  const holding = {
    id: 'holding-uuid-nodate',
    name: 'Undated Donation',
    asset_type: 'donation' as const,
    funds_allocated: 100,
  };

  const draft = createTaxContributionDraft(holding);

  it('still produces a valid contribution_date', () => {
    expect(draft.contribution_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults tax_year to current year', () => {
    expect(draft.tax_year).toBe(currentYear);
  });
});

// ---------------------------------------------------------------------------
// 10. Helper: createTaxContributionDraft — QCD holding
// ---------------------------------------------------------------------------
describe('createTaxContributionDraft: QCD holding', () => {
  const holding = {
    id: 'holding-uuid-qcd',
    name: 'IRA Direct Distribution',
    asset_type: 'qcd_distribution' as const,
    funds_allocated: 25000,
    created_at: '2025-11-01T00:00:00Z',
  };

  const draft = createTaxContributionDraft(holding);

  it('maps to a canonical cash-adjacent contribution type', () => {
    expect(draft.contribution_type).toBe('wire');
  });

  it('sets qcd_qualified so exports treat it outside Schedule A', () => {
    expect(draft.qcd_qualified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Asset type → contribution type mapping: spot checks
// ---------------------------------------------------------------------------
describe('ASSET_TYPE_TO_CONTRIBUTION_TYPE mapping', () => {
  const canonicalValues = new Set<ContributionType>([
    'cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property',
  ]);

  it('all mapped values are canonical DB types', () => {
    for (const [assetType, contribType] of Object.entries(ASSET_TYPE_TO_CONTRIBUTION_TYPE)) {
      expect(
        canonicalValues.has(contribType as ContributionType),
        `${assetType} maps to non-canonical type '${contribType}'`
      ).toBe(true);
    }
  });

  it('equity_investment → stock', () => {
    expect(suggestContributionType('equity_investment')).toBe('stock');
  });

  it('donation → cash', () => {
    expect(suggestContributionType('donation')).toBe('cash');
  });

  it('real_estate_donation → real_estate', () => {
    expect(suggestContributionType('real_estate_donation')).toBe('real_estate');
  });

  it('cryptocurrency_donation → crypto', () => {
    expect(suggestContributionType('cryptocurrency_donation')).toBe('crypto');
  });

  it('foundation_grant → cash', () => {
    expect(suggestContributionType('foundation_grant')).toBe('cash');
  });

  it('qcd_distribution does not map to ach (non-canonical)', () => {
    const mapped = suggestContributionType('qcd_distribution');
    expect(mapped).not.toBe('ach');
    expect(canonicalValues.has(mapped)).toBe(true);
  });

  it('artwork_collectible_donation does not map to art (non-canonical)', () => {
    const mapped = suggestContributionType('artwork_collectible_donation');
    expect(mapped).not.toBe('art');
    expect(canonicalValues.has(mapped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. isContributionTypeValid: spot checks
// ---------------------------------------------------------------------------
describe('isContributionTypeValid', () => {
  it('equity_investment + stock → valid', () => {
    expect(isContributionTypeValid('equity_investment', 'stock').valid).toBe(true);
  });

  it('equity_investment + cash → invalid', () => {
    expect(isContributionTypeValid('equity_investment', 'cash').valid).toBe(false);
  });

  it('real_estate_donation + real_estate → valid', () => {
    expect(isContributionTypeValid('real_estate_donation', 'real_estate').valid).toBe(true);
  });

  it('real_estate_donation + other_property → invalid', () => {
    expect(isContributionTypeValid('real_estate_donation', 'other_property').valid).toBe(false);
  });

  it('foundation_grant + wire → valid', () => {
    expect(isContributionTypeValid('foundation_grant', 'wire').valid).toBe(true);
  });

  it('donation + stock → valid (appreciated stock donation)', () => {
    expect(isContributionTypeValid('donation', 'stock').valid).toBe(true);
  });
});
