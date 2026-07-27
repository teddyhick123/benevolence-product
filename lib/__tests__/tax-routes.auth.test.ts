// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Routes that use requirePortfolioAccess / isAccessDenied pattern
const requireAccessRoutes = [
  'app/api/portfolio/[id]/tax/form8283/route.ts',
  'app/api/portfolio/[id]/tax/export/route.ts',
  'app/api/portfolio/[id]/tax/overview/route.ts',
  'app/api/portfolio/[id]/tax/summary/route.ts',
];

// All tax routes — each must contain at least one explicit portfolio access guard.
// Accepted guard expressions: requirePortfolioAccess | can_view_portfolio | can_edit_portfolio
const allTaxRoutes = [
  'app/api/portfolio/[id]/tax/profile/route.ts',
  'app/api/portfolio/[id]/tax/overview/route.ts',
  'app/api/portfolio/[id]/tax/summary/route.ts',
  'app/api/portfolio/[id]/tax/contributions/route.ts',
  'app/api/portfolio/[id]/tax/contributions/[contributionId]/route.ts',
  'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts',
  'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route.ts',
  'app/api/portfolio/[id]/tax/carryforwards/route.ts',
  'app/api/portfolio/[id]/tax/form8283/route.ts',
  'app/api/portfolio/[id]/tax/export/route.ts',
  'app/api/portfolio/[id]/tax/scenarios/route.ts',
  'app/api/portfolio/[id]/tax/optimize/route.ts',
  'app/api/portfolio/[id]/tax/cpa-share/route.ts',
];

describe('tax routes auth contract: requirePortfolioAccess pattern', () => {
  for (const route of requireAccessRoutes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }
});

describe('tax routes auth contract: all routes have explicit access guard', () => {
  for (const route of allTaxRoutes) {
    it(`${route} contains an explicit portfolio access guard`, () => {
      const src = readFileSync(route, 'utf8');
      const hasGuard =
        src.includes('can_view_portfolio') ||
        src.includes('can_edit_portfolio') ||
        src.includes('requirePortfolioAccess');
      expect(
        hasGuard,
        `${route} must contain can_view_portfolio, can_edit_portfolio, or requirePortfolioAccess`
      ).toBe(true);
    });
  }
});

/**
 * Extract the body of the first GET handler in a route file.
 * Returns the text from "export async function GET" up to (but not including)
 * the next "export async function" declaration, or end-of-file.
 */
function extractGetHandlerBody(src: string): string {
  const getStart = src.indexOf('export async function GET');
  if (getStart === -1) return '';
  // Find the next export function after the GET handler
  const nextExport = src.indexOf('export async function', getStart + 1);
  return nextExport === -1 ? src.slice(getStart) : src.slice(getStart, nextExport);
}

describe('tax routes auth contract: GET handlers have view-level guard', () => {
  // These routes have GET handlers that read sensitive tax data —
  // each must guard the GET with a view check (can_view_portfolio, can_edit_portfolio,
  // or requirePortfolioAccess) WITHIN the GET handler body itself.
  const getRoutes = [
    'app/api/portfolio/[id]/tax/profile/route.ts',
    'app/api/portfolio/[id]/tax/overview/route.ts',
    'app/api/portfolio/[id]/tax/summary/route.ts',
    'app/api/portfolio/[id]/tax/contributions/route.ts',
    'app/api/portfolio/[id]/tax/contributions/[contributionId]/route.ts',
    'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts',
    'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route.ts',
    'app/api/portfolio/[id]/tax/carryforwards/route.ts',
    'app/api/portfolio/[id]/tax/form8283/route.ts',
    'app/api/portfolio/[id]/tax/export/route.ts',
    'app/api/portfolio/[id]/tax/cpa-share/route.ts',
  ];

  for (const route of getRoutes) {
    it(`${route} GET handler body has a portfolio access guard`, () => {
      const src = readFileSync(route, 'utf8');
      const getBody = extractGetHandlerBody(src);
      expect(getBody, `${route} must have a GET handler`).not.toBe('');
      const hasGuard =
        getBody.includes('can_view_portfolio') ||
        getBody.includes('can_edit_portfolio') ||
        getBody.includes('requirePortfolioAccess');
      expect(
        hasGuard,
        `${route} GET handler body must contain can_view_portfolio, can_edit_portfolio, or requirePortfolioAccess`
      ).toBe(true);
    });
  }
});

describe('tax routes auth contract: AGI reads stay under session RLS', () => {
  it('scenarios and optimization routes do not bypass tax_years RLS with an admin client', () => {
    for (const route of [
      'app/api/portfolio/[id]/tax/scenarios/route.ts',
      'app/api/portfolio/[id]/tax/optimize/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).toMatch(/const sb = await supabasePublic\(\);[\s\S]*from\('tax_years'\)/);
    }
  });

  it('canonical tax_years RLS allows authorized portfolio reads', () => {
    const migration = readFileSync('db/migrations/0013_tax_contributions.sql', 'utf8');
    expect(migration).toMatch(/CREATE POLICY "tax_years_read"[\s\S]*USING \(public\.can_view_portfolio\(portfolio_id\) AND public\.org_has_module\(org_id, 'tax'\)\)/);
  });

  it('tax record GET routes do not cache sensitive tax data', () => {
    for (const route of [
      'app/api/portfolio/[id]/tax/profile/route.ts',
      'app/api/portfolio/[id]/tax/carryforwards/route.ts',
      'app/api/portfolio/[id]/tax/contributions/[contributionId]/route.ts',
      'app/api/portfolio/[id]/tax-years/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toMatch(
        /'Cache-Control': 'no-store'|@\/lib\/api\/responses/
      );
      expect(src, route).not.toContain('s-maxage');
      expect(src, route).not.toContain('private,');
    }
  });

  it('tax year AGI route has an explicit portfolio view guard', () => {
    const src = readFileSync('app/api/portfolio/[id]/tax-years/route.ts', 'utf8');
    expect(src).toContain("rpc('can_view_portfolio'");
  });
});
