// @vitest-environment node

// app/api/__tests__/tax-carryforwards.test.ts
//
// Tests for GET and POST /api/portfolio/[id]/tax/carryforwards
// Covers: auth/access control, contract shape, validation, DB errors,
// portfolio_id mismatch guard, and cross-portfolio security.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/portfolio/[id]/tax/carryforwards/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const PORTFOLIO_ID    = '11111111-1111-1111-1111-111111111111';
const OTHER_PORTFOLIO = '22222222-2222-2222-2222-222222222222';
const CARRYFORWARD_ID = '55555555-5555-5555-5555-555555555555';

// ── Mock state ─────────────────────────────────────────────────────────────────

let _canView       = true;
let _canViewError: { message: string } | null = null;
let _canEdit       = true;
let _canEditError: { message: string } | null = null;

// v_active_carryforwards list result
let _carryforwards: any[]                       = [];
let _carryforwardsError: { message: string } | null = null;

// tax_carryforwards insert result
let _insertResult: any = {
  id:                   CARRYFORWARD_ID,
  portfolio_id:         PORTFOLIO_ID,
  originating_tax_year: 2024,
  expires_tax_year:     2029,
  amount:               5000,
  amount_remaining:     5000,
  agi_limit_category:   '30_appreciated',
};
let _insertError: { message: string } | null = null;
let _applyResult: any = {
  applied_tax_year: 2025,
  applications_count: 1,
  amount_applied: 1000,
};
let _applyError: { message: string } | null = null;

const mockRpc  = vi.fn();
const mockFrom = vi.fn();

// Mock only at the DB boundary — never mock application code.
vi.mock('@/lib/supabase', () => ({
  supabasePublic: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
}));

// ── Mock setup ─────────────────────────────────────────────────────────────────

function setupMocks() {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_view_portfolio') return { data: _canView, error: _canViewError };
    if (fn === 'can_edit_portfolio') return { data: _canEdit, error: _canEditError };
    if (fn === 'replace_tax_carryforward_applications') return { data: _applyResult, error: _applyError };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    // ── v_active_carryforwards ───────────────────────────────────────────────
    if (table === 'v_active_carryforwards') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        order:  vi.fn(() =>
          Promise.resolve({ data: _carryforwards, error: _carryforwardsError })
        ),
      };
      return b;
    }

    // ── tax_carryforwards (insert) ───────────────────────────────────────────
    if (table === 'tax_carryforwards') {
      const b: any = {
        insert: vi.fn(() => b),
        select: vi.fn(() => b),
        single: vi.fn(() =>
          Promise.resolve({ data: _insertResult, error: _insertError })
        ),
      };
      return b;
    }

    // Fallback
    const fb: any = {
      select: vi.fn(() => fb),
      eq:     vi.fn(() => fb),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return fb;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCtx(portfolioId = PORTFOLIO_ID) {
  return { params: Promise.resolve({ id: portfolioId }) };
}

function makeGetRequest(portfolioId = PORTFOLIO_ID): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/carryforwards`);
}

function makePostRequest(portfolioId = PORTFOLIO_ID, body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/carryforwards`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );
}

function makePatchRequest(portfolioId = PORTFOLIO_ID, body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/carryforwards`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

const VALID_POST_BODY = {
  portfolio_id:         PORTFOLIO_ID,
  originating_tax_year: 2024,
  expires_tax_year:     2029,
  amount:               5000,
  amount_remaining:     5000,
  agi_limit_category:   '30_appreciated',
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _canView            = true;
  _canViewError       = null;
  _canEdit            = true;
  _canEditError       = null;
  _carryforwards      = [];
  _carryforwardsError = null;
  _insertResult       = {
    id:                   CARRYFORWARD_ID,
    portfolio_id:         PORTFOLIO_ID,
    originating_tax_year: 2024,
    expires_tax_year:     2029,
    amount:               5000,
    amount_remaining:     5000,
    agi_limit_category:   '30_appreciated',
  };
  _insertError = null;
  _applyResult = {
    applied_tax_year: 2025,
    applications_count: 1,
    amount_applied: 1000,
  };
  _applyError = null;
  setupMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET — list active carryforwards
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/carryforwards', () => {

  // ── P0: Auth ─────────────────────────────────────────────────────────────────

  it('returns 403 and no data when can_view_portfolio is false', async () => {
    // Arrange
    _canView = false;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — status AND absence of data
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 and no data when can_view_portfolio RPC itself errors', async () => {
    // Arrange — infrastructure failure is treated identically to access denial
    _canViewError = { message: 'connection refused' };
    _canView      = false;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });

  // ── P1: Contract shape ────────────────────────────────────────────────────────

  it('returns 200 with a data array on success', async () => {
    // Arrange
    _carryforwards = [
      {
        id:                   CARRYFORWARD_ID,
        portfolio_id:         PORTFOLIO_ID,
        originating_tax_year: 2024,
        expires_tax_year:     2029,
        amount:               5000,
        amount_remaining:     5000,
        agi_limit_category:   '30_appreciated',
      },
    ];

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body).not.toHaveProperty('error');
  });

  it('returns an empty array (not null) when no active carryforwards exist', async () => {
    // Arrange — _carryforwards defaults to []

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('returns the expected canonical fields on each carryforward record', async () => {
    // Arrange
    _carryforwards = [
      {
        id:                   CARRYFORWARD_ID,
        portfolio_id:         PORTFOLIO_ID,
        originating_tax_year: 2023,
        expires_tax_year:     2028,
        amount:               10000,
        amount_remaining:     7500,
        agi_limit_category:   '60_cash',
      },
    ];

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — all canonical columns present
    const cf = body.data[0];
    expect(cf).toHaveProperty('id');
    expect(cf).toHaveProperty('portfolio_id', PORTFOLIO_ID);
    expect(cf).toHaveProperty('originating_tax_year', 2023);
    expect(cf).toHaveProperty('expires_tax_year', 2028);
    expect(cf).toHaveProperty('amount', 10000);
    expect(cf).toHaveProperty('amount_remaining', 7500);
    expect(cf).toHaveProperty('agi_limit_category', '60_cash');
  });

  // ── P1: DB error → 500 ───────────────────────────────────────────────────────

  it('returns 500 and propagates the DB error message when the view query fails', async () => {
    // Arrange
    _carryforwardsError = { message: 'relation "v_active_carryforwards" does not exist' };
    _carryforwards      = null as any;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST — create carryforward
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/portfolio/[id]/tax/carryforwards', () => {

  // ── P0: Auth ─────────────────────────────────────────────────────────────────

  it('returns 403 when can_edit_portfolio is false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
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
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });

  // ── P0: portfolio_id mismatch ─────────────────────────────────────────────────

  it('returns 400 when portfolio_id in the body does not match the URL parameter', async () => {
    // Arrange — body claims a different portfolio than the URL
    const mismatchedBody = { ...VALID_POST_BODY, portfolio_id: OTHER_PORTFOLIO };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, mismatchedBody), makeCtx(PORTFOLIO_ID));
    const body = await res.json();

    // Assert — caught before any DB write
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/mismatch/i);
    expect(body).not.toHaveProperty('data');
  });

  // ── P0: Missing required fields ───────────────────────────────────────────────

  it('returns 400 when originating_tax_year is missing', async () => {
    // Arrange — required field omitted
    const { originating_tax_year, ...bodyWithout } = VALID_POST_BODY;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, bodyWithout), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when amount is missing', async () => {
    // Arrange
    const { amount, ...bodyWithout } = VALID_POST_BODY;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, bodyWithout), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount_remaining is missing', async () => {
    // Arrange — both amount and amount_remaining are required
    const { amount_remaining, ...bodyWithout } = VALID_POST_BODY;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, bodyWithout), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when agi_limit_category is missing', async () => {
    // Arrange
    const { agi_limit_category, ...bodyWithout } = VALID_POST_BODY;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, bodyWithout), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when expires_tax_year is missing', async () => {
    // Arrange
    const { expires_tax_year, ...bodyWithout } = VALID_POST_BODY;

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, bodyWithout), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  // ── P0: Zod cross-field refinements ──────────────────────────────────────────

  it('returns 400 when amount_remaining exceeds amount', async () => {
    // Arrange — amount_remaining > amount violates the Zod refine rule
    const body = { ...VALID_POST_BODY, amount: 1000, amount_remaining: 1500 };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when expires_tax_year is before originating_tax_year', async () => {
    // Arrange — logically invalid: can't expire before it originated
    const body = {
      ...VALID_POST_BODY,
      originating_tax_year: 2025,
      expires_tax_year:     2024,
    };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when amount is zero (Zod requires positive)', async () => {
    // Arrange
    const body = { ...VALID_POST_BODY, amount: 0, amount_remaining: 0 };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when agi_limit_category is not a valid enum value', async () => {
    // Arrange — only 5 allowed values; 'unknown_category' is not one of them
    const body = { ...VALID_POST_BODY, agi_limit_category: 'unknown_category' };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    // Arrange
    const req = new Request(
      `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/carryforwards`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    'not { valid json',
      }
    );

    // Act
    const res  = await POST(req, makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });

  // ── P1: DB error → 500 ───────────────────────────────────────────────────────

  it('returns 500 and the DB error message when the insert fails', async () => {
    // Arrange
    _insertError  = { message: 'duplicate key value violates unique constraint' };
    _insertResult = null;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body.error).toBe('duplicate key value violates unique constraint');
    expect(body).not.toHaveProperty('data');
  });

  // ── P1: Success contract ──────────────────────────────────────────────────────

  it('returns 201 and the created carryforward wrapped in { data } on success', async () => {
    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe(CARRYFORWARD_ID);
    expect(body.data.portfolio_id).toBe(PORTFOLIO_ID);
    expect(body).not.toHaveProperty('error');
  });

  it('accepts expires_tax_year equal to originating_tax_year (same-year expiration is valid)', async () => {
    // Arrange — boundary case: originates and expires in the same year (allowed by the refine)
    const body = {
      ...VALID_POST_BODY,
      originating_tax_year: 2024,
      expires_tax_year:     2024,
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — schema allows >= not just >
    expect(res.status).toBe(201);
  });

  it('accepts amount_remaining equal to zero (fully-used carryforward is valid)', async () => {
    // Arrange — a carryforward that has been completely applied still has a valid record
    const body = {
      ...VALID_POST_BODY,
      amount:           5000,
      amount_remaining: 0,
    };

    // Act
    const res = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());

    // Assert — schema uses z.number().nonnegative() for amount_remaining
    expect(res.status).toBe(201);
  });

  it('persists optional recipient_name and notes when provided', async () => {
    // Arrange — optional descriptive fields
    const body = {
      ...VALID_POST_BODY,
      recipient_name: 'Stanford University',
      notes:          'Carried over from 2023 stock donation',
    };
    _insertResult = {
      ...VALID_POST_BODY,
      id:             CARRYFORWARD_ID,
      recipient_name: 'Stanford University',
      notes:          'Carried over from 2023 stock donation',
    };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert — optional fields returned in the response
    expect(res.status).toBe(201);
    expect(json.data.recipient_name).toBe('Stanford University');
    expect(json.data.notes).toBe('Carried over from 2023 stock donation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH — persist carryforward applications
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/portfolio/[id]/tax/carryforwards', () => {
  const VALID_PATCH_BODY = {
    tax_year: 2025,
    applications: [
      {
        carryforward_id: CARRYFORWARD_ID,
        amount_applied: 1000,
        notes: 'Applied to 2025 AGI limit',
      },
    ],
  };

  it('returns 403 when can_edit_portfolio is false', async () => {
    _canEdit = false;

    const res = await PATCH(makePatchRequest(PORTFOLIO_ID, VALID_PATCH_BODY), makeCtx());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(mockRpc).not.toHaveBeenCalledWith(
      'replace_tax_carryforward_applications',
      expect.anything()
    );
  });

  it('returns 400 for an invalid application payload', async () => {
    const res = await PATCH(
      makePatchRequest(PORTFOLIO_ID, {
        tax_year: 2025,
        applications: [{ carryforward_id: CARRYFORWARD_ID, amount_applied: 0 }],
      }),
      makeCtx()
    );

    expect(res.status).toBe(400);
  });

  it('persists applications through the idempotent replacement RPC', async () => {
    const res = await PATCH(makePatchRequest(PORTFOLIO_ID, VALID_PATCH_BODY), makeCtx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(_applyResult);
    expect(mockRpc).toHaveBeenCalledWith('replace_tax_carryforward_applications', {
      p_portfolio_id: PORTFOLIO_ID,
      p_tax_year: 2025,
      p_applications: VALID_PATCH_BODY.applications,
    });
  });

  it('returns 500 when the replacement RPC fails', async () => {
    _applyError = { message: 'Application amount exceeds remaining carryforward balance' };

    const res = await PATCH(makePatchRequest(PORTFOLIO_ID, VALID_PATCH_BODY), makeCtx());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/exceeds remaining/);
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS enforcement (can_view_portfolio / can_edit_portfolio at DB level):
 *   tested in db/migrations integration tests; application trusts the RPC return.
 *
 * - View sort order (expires_tax_year ascending): the route passes
 *   .order('expires_tax_year', { ascending: true }) to Supabase; verifying DB ordering
 *   requires a real Supabase instance.
 *
 * - tax_contribution_id FK referential integrity: requires live DB with FK constraints.
 *
 * - Physical cross-tenant isolation via JWT: requires a real Supabase Auth session.
 *
 * - Cache-Control headers: GET and POST return 'no-store' —
 *   verified by code inspection, no runtime variability.
 *
 * - Concurrent insert race (two identical carryforwards): DB-level unique constraint test;
 *   mock cannot simulate this authentically.
 */
