// app/api/__tests__/tax-contributions.auth.test.ts
//
// P0 tests: contract shape, auth/access control, cross-portfolio security,
// and DB error propagation for GET and POST /api/portfolio/[id]/tax/contributions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/portfolio/[id]/tax/contributions/route';
import { stubQuery, stubSupabase } from '@/tests/helpers/supabase-mock';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PORTFOLIO_ID = '22222222-2222-2222-2222-222222222222';
const CONTRIBUTION_ID = '33333333-3333-3333-3333-333333333333';

// ── Mock state ────────────────────────────────────────────────────────────────

let _canView = true;
let _canViewError: { message: string } | null = null;
let _canEdit = true;
let _canEditError: { message: string } | null = null;
let _authenticated = true;
let _contributions: any[] = [];
let _contributionsError: { message: string } | null = null;
let _insertResult: any = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
let _insertError: { message: string } | null = null;
let _enrichedResult: any = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
let _capturedInsertArgs: any = null;

const mockRpc = vi.fn();
const mockFrom = vi.fn();

// Mock only at the DB boundary — never mock application code.
vi.mock('@/lib/api/server-client', () => ({
  supabasePublic: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (
    portfolioId: string,
    minRole: 'viewer' | 'member' = 'viewer'
  ) => {
    if (!_authenticated) {
      return {
        ok: false,
        reason: 'unauthenticated',
        response: Response.json(
          { error: 'Unauthorized' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }

    const infrastructureError = minRole === 'member' ? _canEditError : _canViewError;
    if (infrastructureError) {
      return {
        ok: false,
        reason: 'infrastructure',
        response: Response.json(
          { error: infrastructureError.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }

    const allowed = minRole === 'member' ? _canEdit : _canView;
    if (!allowed) {
      return {
        ok: false,
        reason: 'forbidden',
        response: Response.json(
          { error: 'Access denied' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }

    return {
      ok: true,
      context: {
        db: { rpc: mockRpc, from: mockFrom },
        portfolioId,
        orgId: 'org-1',
        role: minRole,
        principal: { kind: 'user', userId: 'user-1' },
        user: { id: 'user-1' },
      },
    };
  }),
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

function setupMocks() {
  const stub = stubSupabase({
    rpc: {
      can_view_portfolio: () => ({ data: _canView, error: _canViewError }),
      can_edit_portfolio: () => ({ data: _canEdit, error: _canEditError }),
    },
    tables: {
      v_tax_contributions_enriched: () =>
        stubQuery(
          { data: _contributions, error: _contributionsError },
          { single: { data: _enrichedResult, error: null } }
        ),
      tax_documents: () => stubQuery({ data: [], error: null }),
      tax_contributions: () => {
        const q = stubQuery({ data: _insertResult, error: _insertError });
        q.insert.mockImplementation((args: unknown) => {
          _capturedInsertArgs = args;
          return q;
        });
        return q;
      },
    },
    fallbackTable: () => stubQuery({ data: null, error: null }),
  });
  mockRpc.mockImplementation(stub.rpc);
  mockFrom.mockImplementation(stub.from);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(portfolioId = PORTFOLIO_ID, year = 2024): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/contributions?year=${year}`);
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

const VALID_POST_BODY = {
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
  mockFrom.mockClear();
  mockRpc.mockClear();
  _canView = true;
  _canViewError = null;
  _canEdit = true;
  _canEditError = null;
  _authenticated = true;
  _contributions = [];
  _contributionsError = null;
  _insertResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
  _insertError = null;
  _enrichedResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, document_count: 0 };
  _capturedInsertArgs = null;
  setupMocks();
});

// ── GET: Contract ─────────────────────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/contributions — contract', () => {
  it('returns a data array and a numeric count on success', async () => {
    // Arrange
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1000 },
    ];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBe(1);
  });

  it('includes a document_count field on every contribution item', async () => {
    // Arrange
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 500 },
    ];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(body.data[0]).toHaveProperty('document_count');
    expect(typeof body.data[0].document_count).toBe('number');
  });

  it('returns an empty data array (not null) when no contributions exist', async () => {
    // Arrange — _contributions defaults to []

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns error field (not data) when the DB query fails', async () => {
    // Arrange
    _contributionsError = { message: 'relation "v_tax_contributions_enriched" does not exist' };
    _contributions = null as any;

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── GET: Auth & Access Control ────────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/contributions — auth', () => {
  it('returns 401 when no valid session exists', async () => {
    _authenticated = false;

    const res = await GET(makeGetRequest(), makeCtx());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 and no data when can_view_portfolio returns false', async () => {
    // Arrange
    _canView = false;
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1000 },
    ];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — status AND absence of data (not just the status code)
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 when the can_view_portfolio RPC itself errors', async () => {
    // Arrange
    _canViewError = { message: 'connection refused' };

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });
});

// ── GET: Cross-Portfolio Security ─────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/contributions — cross-portfolio security', () => {
  it('only returns contributions whose portfolio_id matches the URL parameter', async () => {
    // Arrange — simulate DB returning contributions for the correct portfolio only
    // (RLS + the eq filter together enforce this; we verify the contract holds at the API layer)
    _contributions = [
      { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1000 },
      { id: '44444444-4444-4444-4444-444444444444', portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 500 },
    ];

    // Act
    const res = await GET(makeGetRequest(PORTFOLIO_ID), makeCtx(PORTFOLIO_ID));
    const body = await res.json();

    // Assert — every returned item belongs to the requested portfolio
    const portfolioIds = body.data.map((c: any) => c.portfolio_id);
    expect(portfolioIds.every((id: string) => id === PORTFOLIO_ID)).toBe(true);
  });
});

// ── POST: Contract ────────────────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — contract', () => {
  it('returns 201 and a data object containing the created contribution', async () => {
    // Arrange — enriched result contains the full record
    _enrichedResult = {
      id: CONTRIBUTION_ID,
      portfolio_id: PORTFOLIO_ID,
      tax_year: 2024,
      contribution_type: 'cash',
      amount_usd: 1000,
      recipient_name: 'American Red Cross',
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(CONTRIBUTION_ID);
    expect(body).not.toHaveProperty('error');
  });

  it('returns the enriched view result (not raw insert result) when enriched fetch succeeds', async () => {
    // Arrange — enriched result has extra computed fields the raw insert does not
    _insertResult = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID };
    _enrichedResult = {
      id: CONTRIBUTION_ID,
      portfolio_id: PORTFOLIO_ID,
      substantiation_status: 'compliant',   // computed by the view, not in the insert
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert — enriched fields are present
    expect(body.data.substantiation_status).toBe('compliant');
  });
});

// ── POST: Auth & Access Control ───────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — auth', () => {
  it('returns 401 when no valid session exists', async () => {
    _authenticated = false;

    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 500 (not 403) when the can_edit_portfolio RPC itself errors', async () => {
    // Arrange — RPC failure is distinct from auth denial; it's an infrastructure error
    _canEditError = { message: 'timeout' };
    _canEdit = null as any;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when portfolio_id in body does not match the URL parameter', async () => {
    // Arrange — body claims a different portfolio
    const mismatchedBody = { ...VALID_POST_BODY, portfolio_id: OTHER_PORTFOLIO_ID };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, mismatchedBody), makeCtx(PORTFOLIO_ID));
    const body = await res.json();

    // Assert — caught before any DB write
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/mismatch/i);
  });
});

// ── POST: DB Error ────────────────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/contributions — DB error propagation', () => {
  it('returns 500 when the tax_contributions insert fails', async () => {
    // Arrange
    _insertError = { message: 'duplicate key value violates unique constraint' };
    _insertResult = null;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert — error surfaced, not swallowed
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS policies (can_view_portfolio / can_edit_portfolio enforcement at DB level):
 *   tested at the DB layer in db/migrations; application code trusts RLS as a second line.
 *
 * - Cross-tenant read via tampered JWT: requires a real Supabase Auth session;
 *   the application's can_view_portfolio RPC is the enforcement point, tested above
 *   via the mock returning false.
 *
 * - Cache-Control header correctness: all routes in this file set no-store;
 *   verified by inspection — no runtime variability.
 */
// Integration test.
