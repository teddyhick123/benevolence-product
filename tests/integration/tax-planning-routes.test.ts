// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as optimize } from '@/app/api/portfolio/[id]/tax/optimize/route';
import { POST as scenarios } from '@/app/api/portfolio/[id]/tax/scenarios/route';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
let _canEdit = true;
let _taxYear: any;
let _summary: any;
let _holdings: any[];
let _enhancedHoldings: any[];

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabasePublic: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (
    portfolioId: string,
    minRole: 'member'
  ) => _canEdit
    ? {
        ok: true,
        context: {
          db: { rpc: mockRpc, from: mockFrom },
          portfolioId,
          orgId: 'org-1',
          role: minRole,
          principal: { kind: 'user', userId: 'user-1' },
          user: { id: 'user-1' },
        },
      }
    : {
        ok: false,
        reason: 'forbidden',
        response: Response.json(
          { error: 'Access denied' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        ),
      }),
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

vi.mock('@/lib/tax/optimization-engine', () => ({
  optimizeDonationStrategy: vi.fn(() => [{ strategy: 'cash' }]),
  generateOptimizationSummary: vi.fn(() => 'Use the cash strategy.'),
}));

vi.mock('@/lib/tax/scenario-calculator', () => ({
  calculateScenario: vi.fn(() => ({ deductible_amount: 25_000 })),
  compareScenarios: vi.fn(() => ({ best_scenario: 0 })),
  calculateOptimalDonation: vi.fn(() => ({ optimal_amount: 50_000 })),
  analyzeBunchingStrategy: vi.fn(() => ({ recommended: true })),
}));

function request(path: 'optimize' | 'scenarios', body: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function context() {
  return { params: Promise.resolve({ id: PORTFOLIO_ID }) };
}

beforeEach(() => {
  _canEdit = true;
  _taxYear = {
    tax_year: 2024,
    adjusted_gross_income: 200_000,
    filing_status: 'single',
  };
  _summary = {
    contributed_60_pct: 5_000,
    contributed_50_pct: 0,
    contributed_30_pct: 0,
    contributed_20_pct: 0,
  };
  _holdings = [{
    id: 'holding-1',
    name: 'Example Asset',
    asset_type: 'stock',
    funds_allocated: 75_000,
  }];
  _enhancedHoldings = [{ id: 'holding-1', cost_basis: 20_000, fmv: 75_000 }];
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockRpc.mockImplementation(async (name: string) => ({
    data: name === 'can_edit_portfolio' ? _canEdit : null,
    error: null,
  }));
  mockFrom.mockImplementation((table: string) => {
    if (table === 'tax_years') {
      const result = { data: _taxYear, error: null };
      return stubQuery(result, { maybeSingle: result });
    }
    if (table === 'v_portfolio_tax_summary') {
      const result = { data: _summary, error: null };
      return stubQuery(result, { maybeSingle: result });
    }
    if (table === 'v_holdings') return stubQuery({ data: _holdings, error: null });
    if (table === 'holdings') return stubQuery({ data: _enhancedHoldings, error: null });
    throw new Error(`Unexpected table ${table}`);
  });
});

describe('tax planning route access', () => {
  it.each([
    ['optimize', optimize, { year: 2024 }],
    ['scenarios', scenarios, { mode: 'single', year: 2024, scenarios: [{}] }],
  ] as const)('%s returns 403 without portfolio edit access', async (path, handler, body) => {
    _canEdit = false;

    const response = await handler(request(path, body), context());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each([
    ['optimize', optimize, { year: 2024 }],
    ['scenarios', scenarios, { mode: 'single', year: 2024, scenarios: [{}] }],
  ] as const)('%s returns the existing AGI-required error', async (path, handler, body) => {
    _taxYear = null;

    const response = await handler(request(path, body), context());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: 'AGI not set' });
    expect(json.message).toContain('2024');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST tax optimize contract', () => {
  it('returns strategies and the analyzed holding count', async () => {
    const response = await optimize(request('optimize', {
      year: 2024,
      donation_goal: 25_000,
    }), context());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(json.data).toEqual({
      strategies: [{ strategy: 'cash' }],
      summary: 'Use the cash strategy.',
      tax_situation: {
        agi: 200_000,
        filing_status: 'single',
        existing_contributions_60_pct: 5_000,
        existing_contributions_50_pct: 0,
        existing_contributions_30_pct: 0,
        existing_contributions_20_pct: 0,
      },
      holdings_analyzed: 1,
    });
  });
});

describe('POST tax scenarios contract', () => {
  it('returns the single-scenario result in the existing data envelope', async () => {
    const response = await scenarios(request('scenarios', {
      mode: 'single',
      year: 2024,
      scenarios: [{ donation_amount: 25_000, donation_type: 'cash' }],
    }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { deductible_amount: 25_000 } });
  });

  it('returns 400 for an unsupported mode', async () => {
    const response = await scenarios(request('scenarios', {
      mode: 'unsupported',
      year: 2024,
    }), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid mode. Use: single, compare, optimal, or bunching',
    });
  });
});
