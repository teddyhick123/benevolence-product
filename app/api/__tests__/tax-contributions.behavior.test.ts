// app/api/__tests__/tax-contributions.behavior.test.ts
//
// P1 tests: boundary/validation, happy paths, and business logic derivations
// for GET and POST /api/portfolio/[id]/tax/contributions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/portfolio/[id]/tax/contributions/route';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
const CONTRIBUTION_ID = '33333333-3333-3333-3333-333333333333';

// ── Mock state ────────────────────────────────────────────────────────────────

let _canEdit = true;
let _canView = true;
let _contributions: any[] = [];
let _documents: Array<{ tax_contribution_id: string }> = [];
let _insertResult: any = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
let _insertError: { message: string } | null = null;
let _enrichedResult: any = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
let _capturedInsertArgs: any = null;

const mockRpc = vi.fn();
const mockFrom = vi.fn();

// Mock only at the DB boundary — never mock application code.
vi.mock('@/lib/supabase', () => ({
  supabasePublic: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
}));

function setupMocks() {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_view_portfolio') return { data: _canView, error: null };
    if (fn === 'can_edit_portfolio') return { data: _canEdit, error: null };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'v_tax_contributions_enriched') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(() => Promise.resolve({ data: _contributions, error: null })),
        single: vi.fn(() => Promise.resolve({ data: _enrichedResult, error: null })),
      };
      return b;
    }
    if (table === 'tax_documents') {
      const b: any = {
        select: vi.fn(() => b),
        in: vi.fn(() => Promise.resolve({ data: _documents, error: null })),
      };
      return b;
    }
    if (table === 'tax_contributions') {
      const b: any = {
        insert: vi.fn((args: any) => { _capturedInsertArgs = args; return b; }),
        select: vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: _insertResult, error: _insertError })),
      };
      return b;
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(portfolioId = PORTFOLIO_ID, year?: number): Request {
  const url = year !== undefined
    ? `http://localhost/api/portfolio/${portfolioId}/tax/contributions?year=${year}`
    : `http://localhost/api/portfolio/${portfolioId}/tax/contributions`;
  return new Request(url);
}

function makeCtx(portfolioId = PORTFOLIO_ID) {
  return { params: Promise.resolve({ id: portfolioId }) };
}

function makePostRequest(portfolioId = PORTFOLIO_ID, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(portfolioId = PORTFOLIO_ID): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not { valid } json {{',
  });
}

const BASE_VALID_BODY = {
  portfolio_id: PORTFOLIO_ID,
  tax_year: 2024,
  contribution_date: '2024-06-15',
  recipient_name: 'American Red Cross',
  recipient_type: '501c3_public',
  contribution_type: 'cash',
  amount_usd: 1000,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _canEdit = true;
  _canView = true;
  _contributions = [];
  _documents = [];
  _insertResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
  _insertError = null;
  _enrichedResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
  _capturedInsertArgs = null;
  setupMocks();
});

// ── GET: Happy Path ───────────────────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/contributions — happy path', () => {
  it('accepts an explicit year parameter and returns 200 with matching contributions', async () => {
    // Arrange
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2022, amount_usd: 500 },
    ];

    // Act
    const res = await GET(makeGetRequest(PORTFOLIO_ID, 2022), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it('returns document_count of 0 for each contribution when no documents are uploaded', async () => {
    // Arrange — contribution exists but the documents table returns an empty array
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1000 },
    ];
    _documents = [];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(body.data[0].document_count).toBe(0);
  });

  it('counts each uploaded document and reflects the total in document_count', async () => {
    // Arrange — two documents for the same contribution
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1000 },
    ];
    _documents = [
      { tax_contribution_id: CONTRIBUTION_ID },
      { tax_contribution_id: CONTRIBUTION_ID },
    ];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(body.data[0].document_count).toBe(2);
  });
});

// ── POST: Boundary / Validation ───────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — boundary/validation', () => {
  it('returns 400 when amount_usd is zero', async () => {
    // Arrange — Zod schema enforces z.number().positive() on amount_usd
    const body = { ...BASE_VALID_BODY, amount_usd: 0 };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when amount_usd is negative', async () => {
    // Arrange
    const body = { ...BASE_VALID_BODY, amount_usd: -500 };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when contribution_date uses slash-separated format instead of ISO 8601', async () => {
    // Arrange — schema requires YYYY-MM-DD; MM/DD/YYYY is rejected
    const body = { ...BASE_VALID_BODY, contribution_date: '06/15/2024' };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when contribution_type is not a recognized enum value', async () => {
    // Arrange — 'bitcoin' is not in the 7-value enum
    const body = { ...BASE_VALID_BODY, contribution_type: 'bitcoin' };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when tax_year is before the minimum accepted year of 2000', async () => {
    // Arrange
    const body = { ...BASE_VALID_BODY, tax_year: 1999 };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-cash contributions over $500 that omit fmv_at_donation', async () => {
    // Arrange — IRS requires FMV documentation for non-cash contributions over $500
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      amount_usd: 600,
      // fmv_at_donation intentionally absent
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 for non-cash contributions over $5,000 that do not set requires_appraisal to true', async () => {
    // Arrange — IRS requires a qualified appraisal for non-cash gifts exceeding $5,000
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      amount_usd: 6000,
      fmv_at_donation: 6000,
      requires_appraisal: false,
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when qcd_qualified is true for a non-cash contribution_type', async () => {
    // Arrange — QCDs are IRA distributions; only cash/check/wire qualify under IRC §408(d)(8)
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      amount_usd: 100,
      qcd_qualified: true,
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when the request body is not valid JSON', async () => {
    // Act
    const res = await POST(makeInvalidJsonRequest(), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });
});

// ── POST: Happy Path ──────────────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — happy path', () => {
  it('creates a cash contribution and returns 201 with the enriched record', async () => {
    // Arrange
    _enrichedResult = {
      id: CONTRIBUTION_ID,
      portfolio_id: PORTFOLIO_ID,
      tax_year: 2024,
      contribution_type: 'cash',
      amount_usd: 1000,
      substantiation_status: 'compliant',
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, BASE_VALID_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(CONTRIBUTION_ID);
    expect(body).not.toHaveProperty('error');
  });

  it('creates a stock contribution with required fmv and appraisal fields and returns 201', async () => {
    // Arrange
    const stockBody = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      amount_usd: 6000,
      fmv_at_donation: 6000,
      requires_appraisal: true,
    };
    _insertResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, contribution_type: 'stock' };
    _enrichedResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, contribution_type: 'stock' };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, stockBody), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(body.data.id).toBe(CONTRIBUTION_ID);
  });
});

// ── POST: Business Logic Derivations ─────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — business logic', () => {
  it('auto-sets agi_limit_category to 60_cash for cash donations to public charities', async () => {
    // Arrange — cash to 501c3_public falls in the 60% AGI deduction bucket
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'cash',
      recipient_type: '501c3_public',
      amount_usd: 1000,
      // agi_limit_category intentionally absent — route must derive it
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — the value written to the DB reflects the auto-derived category
    expect(_capturedInsertArgs).not.toBeNull();
    expect(_capturedInsertArgs.agi_limit_category).toBe('60_cash');
  });

  it('auto-sets agi_limit_category to 30_appreciated for stock donations to public charities', async () => {
    // Arrange — appreciated assets to 501c3_public fall in the 30% AGI deduction bucket
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      recipient_type: '501c3_public',
      amount_usd: 400, // ≤ $500 so FMV is not required by the cross-field refine
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(_capturedInsertArgs.agi_limit_category).toBe('30_appreciated');
  });

  it('does not override an explicitly supplied agi_limit_category', async () => {
    // Arrange — caller supplies 50_conservation; the route must not overwrite it
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'cash',
      recipient_type: '501c3_public',
      agi_limit_category: '50_conservation',
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — caller-supplied value passes through untouched
    expect(_capturedInsertArgs.agi_limit_category).toBe('50_conservation');
  });

  it('auto-calculates deductible_amount as amount_usd minus quid_pro_quo_value', async () => {
    // Arrange — $1,000 donation with a $200 event ticket (quid pro quo)
    const body = {
      ...BASE_VALID_BODY,
      amount_usd: 1000,
      quid_pro_quo_value: 200,
      // deductible_amount intentionally absent — route must derive it
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — deductible portion = 1000 - 200 = 800
    expect(_capturedInsertArgs.deductible_amount).toBe(800);
  });

  it('inserts requires_appraisal as true when the caller sets it for a non-cash contribution over $5,000', async () => {
    // Arrange — Zod cross-field refine enforces requires_appraisal: true for non-cash > $5,000;
    //            route then persists that validated value to the DB.
    const body = {
      ...BASE_VALID_BODY,
      contribution_type: 'stock',
      amount_usd: 6000,
      fmv_at_donation: 6000,
      requires_appraisal: true,
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — IRS appraisal flag is carried through to the insert row
    expect(_capturedInsertArgs.requires_appraisal).toBe(true);
  });

  it('does not override an explicitly supplied deductible_amount', async () => {
    // Arrange — caller provides a custom deductible figure (e.g., partial-year allocation)
    const body = {
      ...BASE_VALID_BODY,
      amount_usd: 1000,
      quid_pro_quo_value: 0,
      deductible_amount: 750, // explicit override
    };

    // Act
    await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — explicit value wins over auto-calculation (1000 - 0 = 1000 would be wrong here)
    expect(_capturedInsertArgs.deductible_amount).toBe(750);
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Year-param DB filtering: the route issues `.eq('tax_year', year)` on the query builder;
 *   confirming that parameter reaches the actual DB is an integration test concern
 *   (requires a real Supabase instance or Postgres harness).
 *
 * - Non-cash boundary at exactly $500 and $5,000: Zod cross-field refines use strict
 *   `> 500` and `> 5000` comparisons; amounts at the boundary are accepted. These exact-
 *   boundary checks belong in lib/schemas/tax.test.ts (schema unit tests).
 *
 * - Cash to private foundation → 30_foundation_cash, non-cash to private foundation →
 *   20_foundation_property: the agi-calculator logic is a pure function; tested directly
 *   in lib/tax/agi-calculator.test.ts. The route delegates to that function.
 *
 * - applied_to_tax_year defaulting to tax_year when absent: verified by reading the route
 *   (`applied_to_tax_year: validated.applied_to_tax_year ?? validated.tax_year`) — no runtime
 *   variability to test at the route level.
 *
 * - Duplicate INSERT (unique constraint → 409): requires DB-level constraint enforcement;
 *   the mock cannot simulate this authentically.
 *
 * - Supabase RLS policies (can_view_portfolio / can_edit_portfolio enforcement at DB level):
 *   tested at the DB layer in db/migrations; application code trusts RLS as a second line.
 */
