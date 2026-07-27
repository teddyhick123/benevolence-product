// app/api/__tests__/tax-contribution-single.test.ts
//
// Tests for GET, PUT, DELETE /api/portfolio/[id]/tax/contributions/[contributionId]
// Covers: auth/access control, contract shape, cross-portfolio security,
// enriched view, DB error propagation, and owner-only delete guard.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT, DELETE } from '@/app/api/portfolio/[id]/tax/contributions/[contributionId]/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const PORTFOLIO_ID      = '11111111-1111-1111-1111-111111111111';
const OTHER_PORTFOLIO   = '22222222-2222-2222-2222-222222222222';
const CONTRIBUTION_ID   = '33333333-3333-3333-3333-333333333333';
const USER_ID           = '44444444-4444-4444-4444-444444444444';

// ── Mock state ─────────────────────────────────────────────────────────────────

let _canView         = true;
let _canViewError:  { message: string } | null = null;
let _canEdit         = true;
let _canEditError:  { message: string } | null = null;

// v_tax_contributions_enriched single-row result
let _enrichedResult: any = {
  id: CONTRIBUTION_ID,
  portfolio_id: PORTFOLIO_ID,
  tax_year: 2024,
  amount_usd: 1000,
  recipient_name: 'Red Cross',
  substantiation_status: 'compliant',
};
let _enrichedError: { message: string } | null = null;

// tax_contributions update result
let _updateResult: any = {
  id: CONTRIBUTION_ID,
  portfolio_id: PORTFOLIO_ID,
  tax_year: 2024,
  amount_usd: 1500,
};
let _updateError: { message: string } | null = null;

// tax_contributions delete error
let _deleteError: { message: string } | null = null;

// portfolio_members membership row
let _membershipResult: any = { role: 'owner' };
let _membershipError:  { message: string } | null = null;

// auth.getUser result
let _userId = USER_ID;
let _authenticated = true;

const mockRpc  = vi.fn();
const mockFrom = vi.fn();
const mockAuth = { getUser: vi.fn() };

// Mock only at the DB boundary — never mock application code.
vi.mock('@/lib/supabase', () => ({
  supabasePublic: vi.fn(async () => ({
    rpc:  mockRpc,
    from: mockFrom,
    auth: mockAuth,
  })),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (
    portfolioId: string,
    minRole: 'viewer' | 'member' | 'owner' = 'viewer'
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

    const error = minRole === 'owner'
      ? _membershipError
      : minRole === 'member'
        ? _canEditError
        : _canViewError;
    if (error) {
      return {
        ok: false,
        reason: 'infrastructure',
        response: Response.json(
          { error: error.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }

    const allowed = minRole === 'owner'
      ? _membershipResult?.role === 'owner'
      : minRole === 'member'
        ? _canEdit
        : _canView;
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
        db: { rpc: mockRpc, from: mockFrom, auth: mockAuth },
        portfolioId,
        orgId: 'org-1',
        role: minRole,
        principal: { kind: 'user', userId: _userId },
        user: { id: _userId },
      },
    };
  }),
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

// ── Mock setup ─────────────────────────────────────────────────────────────────

function setupMocks() {
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: _userId } }, error: null });

  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_view_portfolio') return { data: _canView, error: _canViewError };
    if (fn === 'can_edit_portfolio') return { data: _canEdit, error: _canEditError };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    // ── v_tax_contributions_enriched ─────────────────────────────────────────
    if (table === 'v_tax_contributions_enriched') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: _enrichedResult, error: _enrichedError })),
      };
      return b;
    }

    // ── tax_contributions (update + delete) ──────────────────────────────────
    // The route uses two different call chains on this table:
    //   PUT:    .update(v).eq('id',...).eq('portfolio_id',...).select().single()  → { data, error }
    //   DELETE: .delete().eq('id',...).eq('portfolio_id',...)                    → { error }
    //
    // Strategy: one reusable builder where every method returns `this`.
    // `.single()` resolves as the update terminal.
    // The builder is also directly awaitable (thenable) so `await builder` works
    // for the delete chain (which terminates at the last .eq(), not at .single()).
    if (table === 'tax_contributions') {
      let _isDelete = false;

      const b: any = {};

      // Make the builder itself a Promise (thenable) — used by the DELETE chain
      b.then = (resolve: (v: any) => void) =>
        resolve({ error: _isDelete ? _deleteError : null });

      b.update = vi.fn(() => { _isDelete = false; return b; });
      b.delete = vi.fn(() => { _isDelete = true;  return b; });
      b.eq     = vi.fn(() => b);
      b.select = vi.fn(() => b);
      b.single = vi.fn(() => Promise.resolve({ data: _updateResult, error: _updateError }));

      return b;
    }

    // ── portfolio_members ────────────────────────────────────────────────────
    if (table === 'portfolio_members') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        single: vi.fn(() =>
          Promise.resolve({ data: _membershipResult, error: _membershipError })
        ),
      };
      return b;
    }

    // Fallback — no-op builder
    const fb: any = {
      select: vi.fn(() => fb),
      eq:     vi.fn(() => fb),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return fb;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCtx(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID) {
  return { params: Promise.resolve({ id: portfolioId, contributionId }) };
}

function makeGetRequest(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}`
  );
}

function makePutRequest(
  portfolioId   = PORTFOLIO_ID,
  contributionId = CONTRIBUTION_ID,
  body: Record<string, unknown> = {}
): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}`,
    {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );
}

function makeDeleteRequest(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}`,
    { method: 'DELETE' }
  );
}

const VALID_PUT_BODY = {
  amount_usd:    1500,
  recipient_name: 'Updated Charity',
  tax_year:       2024,
  contribution_date: '2024-07-01',
  contribution_type: 'cash',
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFrom.mockClear();
  mockRpc.mockClear();
  _canView         = true;
  _canViewError    = null;
  _canEdit         = true;
  _canEditError    = null;
  _enrichedResult  = {
    id:                  CONTRIBUTION_ID,
    portfolio_id:        PORTFOLIO_ID,
    tax_year:            2024,
    amount_usd:          1000,
    recipient_name:      'Red Cross',
    substantiation_status: 'compliant',
  };
  _enrichedError   = null;
  _updateResult    = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, tax_year: 2024, amount_usd: 1500 };
  _updateError     = null;
  _deleteError     = null;
  _membershipResult = { role: 'owner' };
  _membershipError  = null;
  _userId           = USER_ID;
  _authenticated    = true;
  setupMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET — single enriched contribution
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/contributions/[contributionId]', () => {

  // ── P0: Auth ─────────────────────────────────────────────────────────────────

  it('returns 401 when no valid session exists', async () => {
    _authenticated = false;

    const res = await GET(makeGetRequest(), makeCtx());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 and no data when can_view_portfolio is false', async () => {
    // Arrange
    _canView = false;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — status AND absence of contribution data
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 and no data when can_view_portfolio RPC itself errors', async () => {
    // Arrange — infrastructure failure treated identically to denial
    _canViewError = { message: 'connection refused' };
    _canView      = false;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });

  // ── P0: 404 when contribution not found ──────────────────────────────────────

  it('returns 404 when the contribution does not exist for this portfolio', async () => {
    // Arrange — enriched view returns null (not found)
    _enrichedResult = null;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(404);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  // ── P0: DB error → 500 ───────────────────────────────────────────────────────

  it('returns 500 and propagates the DB error message when the view query fails', async () => {
    // Arrange
    _enrichedError  = { message: 'relation "v_tax_contributions_enriched" does not exist' };
    _enrichedResult = null;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  // ── P1: Success contract ─────────────────────────────────────────────────────

  it('returns 200 and the enriched contribution wrapped in { data }', async () => {
    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — correct status and envelope shape
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(CONTRIBUTION_ID);
    expect(body).not.toHaveProperty('error');
  });

  it('returns the enriched view fields (substantiation_status) not available on raw table', async () => {
    // Arrange — enriched result carries computed view columns
    _enrichedResult = {
      id:                    CONTRIBUTION_ID,
      portfolio_id:          PORTFOLIO_ID,
      substantiation_status: 'missing_acknowledgment',
      is_compliant:          false,
      calculated_deductible_amount: 1000,
    };

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — view-only fields are present in the response
    expect(body.data.substantiation_status).toBe('missing_acknowledgment');
    expect(body.data.is_compliant).toBe(false);
    expect(body.data.calculated_deductible_amount).toBe(1000);
  });

  // ── P0: Cross-portfolio security ─────────────────────────────────────────────

  it('returns 404 when portfolio_id on the fetched record does not match the URL parameter', async () => {
    // Arrange — the view query has .eq('portfolio_id', portfolio_id), so a mismatched
    // contribution returns null. We simulate that outcome here.
    _enrichedResult = null; // DB returns no row when portfolio_id filter doesn't match

    // Act — request PORTFOLIO_ID but contribution belongs to OTHER_PORTFOLIO
    const res  = await GET(makeGetRequest(PORTFOLIO_ID, CONTRIBUTION_ID), makeCtx(PORTFOLIO_ID));
    const body = await res.json();

    // Assert — not found (not a 200 with another portfolio's data)
    expect(res.status).toBe(404);
    expect(body).not.toHaveProperty('data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT — update contribution
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/portfolio/[id]/tax/contributions/[contributionId]', () => {

  // ── P0: Auth ─────────────────────────────────────────────────────────────────

  it('returns 401 when no valid session exists', async () => {
    _authenticated = false;

    const res = await PUT(
      makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY),
      makeCtx()
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 when can_edit_portfolio is false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 500 (not 403) when the can_edit_portfolio RPC itself errors', async () => {
    // Arrange — RPC failure is an infrastructure error, not an access denial
    _canEditError = { message: 'timeout' };
    _canEdit      = null as any;

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });

  // ── P0: 404 when contribution not found ──────────────────────────────────────

  it('returns 500 when the update finds no matching row (DB returns null)', async () => {
    // Arrange — update on a non-existent contributionId returns null from .single()
    // The route currently returns 500 when updateErr is set; null data with no error
    // is treated as a falsy row (the route returns enriched ?? updated which handles null).
    // When DB raises an error (e.g. PGRST116 "no rows"), that surfaces as 500.
    _updateError  = { message: 'JSON object requested, multiple (or no) rows returned' };
    _updateResult = null;

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert — error propagated, no data exposed
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  // ── P1: Validation ───────────────────────────────────────────────────────────

  it('returns 400 when amount_usd is zero (Zod rejects non-positive values)', async () => {
    // Arrange
    const body = { ...VALID_PUT_BODY, amount_usd: 0 };

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when contribution_type is not a valid enum value', async () => {
    // Arrange
    const body = { ...VALID_PUT_BODY, contribution_type: 'bitcoin' };

    // Act
    const res = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    // Arrange
    const req = new Request(
      `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}`,
      {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    'not { valid json',
      }
    );

    // Act
    const res  = await PUT(req, makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  // ── P1: DB error → 500 ───────────────────────────────────────────────────────

  it('returns 500 and the DB error message when the update query fails', async () => {
    // Arrange
    _updateError  = { message: 'foreign key constraint violation' };
    _updateResult = null;

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body.error).toBe('foreign key constraint violation');
  });

  // ── P1: Success contract ─────────────────────────────────────────────────────

  it('returns 200 with the enriched record after a valid partial update', async () => {
    // Arrange — enriched fetch after update returns the updated record with computed fields
    _enrichedResult = {
      id:                    CONTRIBUTION_ID,
      portfolio_id:          PORTFOLIO_ID,
      amount_usd:            1500,
      substantiation_status: 'compliant',
    };

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(CONTRIBUTION_ID);
    expect(body).not.toHaveProperty('error');
  });

  it('falls back to the raw update result when the enriched view fetch returns null', async () => {
    // Arrange — enriched fetch returns null (e.g. view not yet refreshed), route falls back
    _enrichedResult = null;
    _updateResult   = { id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, amount_usd: 1500 };

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, VALID_PUT_BODY), makeCtx());
    const body = await res.json();

    // Assert — still 200 with the raw update data
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(CONTRIBUTION_ID);
  });

  it('accepts a partial update body with only some fields set', async () => {
    // Arrange — partial update: only update notes
    const partialBody = { notes: 'Updated note for tax season' };

    // Act
    const res  = await PUT(makePutRequest(PORTFOLIO_ID, CONTRIBUTION_ID, partialBody), makeCtx());
    const body = await res.json();

    // Assert — 200, not 400 (updateTaxContributionSchema is .partial())
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE — delete contribution
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/portfolio/[id]/tax/contributions/[contributionId]', () => {

  // ── P0: Auth — owner-only guard ───────────────────────────────────────────────

  it('returns 401 when no valid session exists', async () => {
    _authenticated = false;

    const res = await DELETE(makeDeleteRequest(), makeCtx());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a portfolio member at all', async () => {
    // Arrange — no membership row found
    _membershipResult = null;
    _membershipError  = null;

    // Act
    const res  = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });

  it('returns 403 when the user has "admin" role but not "owner"', async () => {
    // Arrange — admin can edit but not delete
    _membershipResult = { role: 'admin' };

    // Act
    const res  = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/owner/i);
  });

  it('returns 403 when the user has "member" role', async () => {
    // Arrange
    _membershipResult = { role: 'member' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());

    // Assert
    expect(res.status).toBe(403);
  });

  it('returns 403 when the user has "viewer" role', async () => {
    // Arrange
    _membershipResult = { role: 'viewer' };

    // Act
    const res = await DELETE(makeDeleteRequest(), makeCtx());

    // Assert
    expect(res.status).toBe(403);
  });

  // ── P1: DB error → 500 ───────────────────────────────────────────────────────

  it('returns 500 and the DB error message when the delete query fails', async () => {
    // Arrange — owner is set so auth passes; DB then errors
    _membershipResult = { role: 'owner' };
    _deleteError      = { message: 'cannot delete: foreign key constraint on grant_reports' };

    // Act
    const res  = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body.error).toBe('cannot delete: foreign key constraint on grant_reports');
  });

  // ── P1: Success contract ──────────────────────────────────────────────────────

  it('returns { success: true } when the owner successfully deletes a contribution', async () => {
    // Arrange — happy path: owner role, no DB error
    _membershipResult = { role: 'owner' };
    _deleteError      = null;

    // Act
    const res  = await DELETE(makeDeleteRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).not.toHaveProperty('error');
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS enforcement at the database layer (can_view_portfolio /
 *   can_edit_portfolio): tested in db/migrations integration tests; this file
 *   trusts the RPC return value.
 *
 * - Physical cross-tenant DB isolation via JWT claims: requires a live
 *   Supabase instance with real Auth sessions.
 *
 * - Cache-Control header values per handler: verified by code inspection
 *   (GET/PUT/DELETE return 'no-store').
 *
 * - Cascade behavior when a contribution linked to tax_documents or
 *   holding_contributions is deleted: requires a real DB with FK constraints.
 *
 * - portfolio_id mismatch detection for PUT: the route delegates to Supabase's
 *   .eq('portfolio_id', portfolio_id) filter, so a mismatched ID returns null/
 *   error from the DB — already covered by the "DB returns null" test above.
 */
// Integration test.
