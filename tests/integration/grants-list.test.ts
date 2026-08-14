// @vitest-environment node

// app/api/__tests__/grants-list.test.ts
//
// Tests for GET + POST /api/org/[orgId]/grants
// Route: app/api/org/[orgId]/grants/route.ts
//
// Auth model:
//   - Both verbs use requireOrgAccess()
//   - GET: any non-null role is sufficient (member, viewer, admin, owner)
//   - POST: role must be member, admin, or owner
// DB:
//   - Reads use the authorized session client and RLS
//   - Atomic creation uses the org-scoped grants repository

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PORTFOLIO_ID = '22222222-2222-2222-2222-222222222222';
const INVESTEE_ID = '33333333-3333-3333-3333-333333333333';
const GRANT_ID = '44444444-4444-4444-4444-444444444444';
const HOLDING_ID = '55555555-5555-5555-5555-555555555555';

// ─── Mutable mock state ────────────────────────────────────────────────────────

let _authUser: { id: string } | null = { id: 'user-abc' };
let _orgRole: string | null = 'admin';
let _grantsListData: any[] = [];
let _grantsListError: { message: string } | null = null;
let _portfolioData: any | null = { id: PORTFOLIO_ID, org_id: ORG_ID };
let _investeeData: any | null = { id: INVESTEE_ID, display_name: 'Test Grantee Org' };
let _createGrantData: any | null = {
  grant: {
    id: GRANT_ID,
    org_id: ORG_ID,
    portfolio_id: PORTFOLIO_ID,
    holding_id: HOLDING_ID,
    lifecycle_stage: 'draft',
    purpose: 'Support community development',
    requested_amount: 50000,
  },
  holding: { id: HOLDING_ID, name: 'Test Grantee Org' },
  workflow_instance: null,
};
let _createGrantError: { message: string } | null = null;

type GrantsQueryResult = {
  data: any[];
  error: { message: string } | null;
  count: number;
};

// ─── Mock infrastructure ───────────────────────────────────────────────────────

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
let _lastGrantsQueryBuilder: any = null;

vi.mock('@/lib/api/server-client', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: _authUser } })),
    },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: vi.fn(async (orgId: string, minimum: string) => {
    if (!_authUser) {
      return { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) };
    }
    const ranks: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
    if (!_orgRole || (ranks[_orgRole] ?? -1) < (ranks[minimum] ?? 0)) {
      return { ok: false, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) };
    }
    return {
      ok: true,
      context: {
        orgId,
        role: _orgRole,
        user: _authUser,
        principal: { kind: 'user', userId: _authUser.id },
        db: { from: mockAdminFrom, rpc: mockAdminRpc },
      },
    };
  }),
}));

function buildGrantsQueryBuilder() {
  // The grants GET query uses chained builder methods then is cast to `any` and
  // awaited directly (query as any). Vitest resolves the promise when `then` is
  // called on the builder object — use a thenable.
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    order: vi.fn(() => b),
    range: vi.fn(() => b),
    ilike: vi.fn(() => b),
    lte: vi.fn(() => b),
    then: vi.fn((
      resolve: (value: GrantsQueryResult) => GrantsQueryResult | PromiseLike<GrantsQueryResult>,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve({ data: _grantsListData, error: _grantsListError, count: _grantsListData.length })
        .then(resolve, reject)
    ),
  };
  _lastGrantsQueryBuilder = b;
  return b;
}

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });
  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn === 'create_grant_with_foundation_records') {
      return { data: _createGrantData, error: _createGrantError };
    }
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'grants') {
      return {
        // For GET (list): returns a thenable query builder
        ...buildGrantsQueryBuilder(),
      };
    }
    if (table === 'portfolios') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        is: vi.fn(() => b),
        maybeSingle: vi.fn(async () => ({ data: _portfolioData, error: null })),
      };
      return b;
    }
    if (table === 'investees') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        is: vi.fn(() => b),
        maybeSingle: vi.fn(async () => ({ data: _investeeData, error: null })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'inv-new', display_name: 'New Grantee' },
              error: null,
            })),
          })),
        })),
      };
      return b;
    }
    if (table === 'holdings') {
      return {
        delete: vi.fn(() => ({ eq: vi.fn().mockReturnThis() })),
      };
    }
    // Fallback for any other table
    const b: any = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      is: vi.fn(() => b),
      insert: vi.fn(async () => ({ error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    return b;
  });
}

// ─── Subject under test ────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/org/[orgId]/grants/route';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeParams(p: Record<string, string>) {
  return { params: Promise.resolve(p) } as any;
}

// Valid minimal POST body
const VALID_BODY = {
  portfolio_id: PORTFOLIO_ID,
  investee_id: INVESTEE_ID,
  purpose: 'Support community development',
  requested_amount: 50000,
};

// ─── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Arrange: reset all mock state to a clean, happy-path baseline
  _authUser = { id: 'user-abc' };
  _orgRole = 'admin';
  _grantsListData = [];
  _grantsListError = null;
  _portfolioData = { id: PORTFOLIO_ID, org_id: ORG_ID };
  _investeeData = { id: INVESTEE_ID, display_name: 'Test Grantee Org' };
  _createGrantData = {
    grant: {
      id: GRANT_ID,
      org_id: ORG_ID,
      portfolio_id: PORTFOLIO_ID,
      holding_id: HOLDING_ID,
      lifecycle_stage: 'draft',
      purpose: 'Support community development',
      requested_amount: 50000,
    },
    holding: { id: HOLDING_ID, name: 'Test Grantee Org' },
    workflow_instance: null,
  };
  _createGrantError = null;
  _lastGrantsQueryBuilder = null;

  setupMocks();
});

// ─── GET /api/org/[orgId]/grants ───────────────────────────────────────────────

describe('GET /api/org/[orgId]/grants', () => {
  // P0: auth & access control
  it('returns 401 when the request carries no session', async () => {
    // Arrange
    _authUser = null;
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants`);

    // Act
    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    // Assert — not authorized, no data leaked
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty('data');
    expect(body.error).toBeDefined();
  });

  it('returns 403 when the user has no role in the org', async () => {
    // Arrange
    _orgRole = null;
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants`);

    // Act
    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    // Assert — any non-member is forbidden; no data returned
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).not.toHaveProperty('data');
  });

  it('returns grants array for an authenticated org member (viewer role)', async () => {
    // Arrange — viewer is the lowest role; GET should still succeed
    _orgRole = 'viewer';
    _grantsListData = [
      { id: GRANT_ID, org_id: ORG_ID, lifecycle_stage: 'active', requested_amount: 50000 },
    ];
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants`);

    // Act
    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  // P1: response shape
  it('response body includes data array and pagination object', async () => {
    // Arrange
    _grantsListData = [
      { id: GRANT_ID, org_id: ORG_ID, lifecycle_stage: 'draft', requested_amount: 10000 },
    ];
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants`);

    // Act
    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(typeof body.pagination.page).toBe('number');
    expect(typeof body.pagination.page_size).toBe('number');
    expect(typeof body.pagination.total).toBe('number');
  });

  it('does not require portfolio_id, allowing org-wide grant search', async () => {
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants?q=clinic&page_size=25`);

    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    expect(res.status).toBe(200);
    expect(_lastGrantsQueryBuilder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(_lastGrantsQueryBuilder.eq).not.toHaveBeenCalledWith('portfolio_id', expect.any(String));
    expect(_lastGrantsQueryBuilder.ilike).toHaveBeenCalledWith('holdings.name', '%clinic%');
  });

  it('keeps portfolio_id scoping when the query requests one', async () => {
    const req = makeRequest(
      'GET',
      `http://localhost/api/org/${ORG_ID}/grants?portfolio_id=${PORTFOLIO_ID}&q=clinic`
    );

    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    expect(res.status).toBe(200);
    expect(_lastGrantsQueryBuilder.eq).toHaveBeenCalledWith('portfolio_id', PORTFOLIO_ID);
    expect(_lastGrantsQueryBuilder.ilike).toHaveBeenCalledWith('holdings.name', '%clinic%');
  });

  it('returns 500 when the database query fails', async () => {
    // Arrange — simulate a DB error by overriding the grants thenable
    _grantsListError = { message: 'connection timeout' };
    const req = makeRequest('GET', `http://localhost/api/org/${ORG_ID}/grants`);

    // Act
    const res = await GET(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/connection timeout/);
  });
});

// ─── POST /api/org/[orgId]/grants ─────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants', () => {
  // P0: auth & access control
  it('returns 401 when the request carries no session', async () => {
    // Arrange
    _authUser = null;
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert — no data returned
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty('grant');
  });

  it('returns 403 when the user has a non-admin role (viewer)', async () => {
    // Arrange — viewer lacks ADMIN_ROLES membership
    _orgRole = 'viewer';
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).not.toHaveProperty('grant');
  });

  it('creates a grant when the user has the operational member role', async () => {
    // Arrange — members can create grants inside configured workflows.
    _orgRole = 'member';
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(201);
  });

  it('returns 403 when the user has no role in the org', async () => {
    // Arrange
    _orgRole = null;
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(403);
  });

  // P0: field validation
  it('returns 400 when portfolio_id is missing', async () => {
    // Arrange
    const { portfolio_id: _, ...bodyWithout } = VALID_BODY;
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, bodyWithout);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/portfolio_id/);
  });

  it('returns 400 when purpose is missing', async () => {
    // Arrange
    const { purpose: _, ...bodyWithout } = VALID_BODY;
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, bodyWithout);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/purpose/);
  });

  it('returns 400 when requested_amount is missing', async () => {
    // Arrange
    const { requested_amount: _, ...bodyWithout } = VALID_BODY;
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, bodyWithout);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/requested_amount/);
  });

  it('returns 422 when neither investee_id nor new_grantee is provided', async () => {
    // Arrange — grantee identity is ambiguous
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, {
      portfolio_id: PORTFOLIO_ID,
      purpose: 'Education',
      requested_amount: 20000,
    });

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(422);
  });

  it('returns 422 when both investee_id and new_grantee are provided', async () => {
    // Arrange — mutually exclusive fields
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, {
      ...VALID_BODY,
      new_grantee: { display_name: 'Conflict Org' },
    });

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(422);
  });

  // P1: happy paths
  it('returns 201 with grant and holding objects on successful creation (investee_id path)', async () => {
    // Arrange — happy path, owner using an existing investee
    _orgRole = 'owner';
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.grant).toBeDefined();
    expect(body.holding).toBeDefined();
  });

  it('returns 201 with grant and holding objects on successful creation (new_grantee path)', async () => {
    // Arrange — admin creating a brand-new grantee in-flight
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, {
      portfolio_id: PORTFOLIO_ID,
      new_grantee: { display_name: 'Brand New Org', sector: 'education' },
      purpose: 'Literacy programs',
      requested_amount: 25000,
    });

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.grant).toBeDefined();
    expect(body.holding).toBeDefined();
  });

  it('grant in the response contains lifecycle_stage field', async () => {
    // Arrange
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert — lifecycle_stage must be present for downstream state-machine use
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.grant).toHaveProperty('lifecycle_stage');
  });

  it('returns 500 when the atomic grant creation RPC fails', async () => {
    // Arrange
    _createGrantData = null;
    _createGrantError = { message: 'unique_violation on grants' };
    const req = makeRequest('POST', `http://localhost/api/org/${ORG_ID}/grants`, VALID_BODY);

    // Act
    const res = await POST(req, makeParams({ orgId: ORG_ID }));

    // Assert
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/unique_violation/);
  });
});

// ─── NOT TESTED HERE ───────────────────────────────────────────────────────────
// - Actual Supabase RLS enforcement (requires a live DB)
// - Query parameter filtering (stage, owner_id, risk_level, due_before, q, portfolio_id)
// - Pagination behavior beyond page/page_size defaults
// - workflow_template_id branch (workflow instance creation inside RPC)
// - Rate limiting / request-per-second caps
// - Response Cache-Control headers
// - Concurrent writes / idempotency (requires integration test)
// Integration test.
