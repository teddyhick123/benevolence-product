// @vitest-environment node

// app/api/__tests__/grants-api.test.ts
// Tests for GET/POST /api/org/[orgId]/grants and GET/PATCH /api/org/[orgId]/grants/[grantId].
// Uses a mock Supabase client to verify 401, 403, 422, and happy-path shapes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Shared mock state ────────────────────────────────────────────────────────
let _authUser: { id: string } | null = { id: 'user-1' };
let _orgRole: string | null = 'admin';
let _createGrantResult: {
  data: { grant: Record<string, unknown>; holding: Record<string, unknown>; workflow_instance: Record<string, unknown> | null } | null;
  error: { message: string } | null;
} = {
  data: {
    grant: { id: 'grant-1', lifecycle_stage: 'draft' },
    holding: { id: 'holding-1', name: 'Test Grantee' },
    workflow_instance: null,
  },
  error: null,
};
let _portfolioData: Record<string, unknown> | null = { id: 'port-1', org_id: 'org-1' };
let _investeeData: Record<string, unknown> | null = { id: 'inv-1', display_name: 'Test Grantee' };

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: _authUser } })),
    },
    rpc: vi.fn(async () => ({ data: _orgRole })),
  })),
  createAdminClient: vi.fn(() => buildAdminMock()),
}));

function buildAdminMock() {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'create_grant_with_foundation_records') return _createGrantResult;
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'portfolios') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: _portfolioData, error: null })) };
      }
      if (table === 'investees') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: _investeeData, error: null })),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn(async () => ({ data: { id: 'inv-new', display_name: 'New Grantee' }, error: null })),
            }),
          }),
        };
      }
      if (table === 'holdings') {
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
        };
      }
      if (table === 'grants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: { id: 'grant-1' }, error: null })),
          then: vi.fn(async (resolve: Function) => resolve({ data: [{ id: 'grant-1' }], error: null, count: 1 })),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnValue({
              single: vi.fn(async () => ({ data: { id: 'grant-1', purpose: 'Education' }, error: null })),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: vi.fn(async (resolve: Function) => resolve({ data: [], error: null, count: 0 })),
        insert: vi.fn(async () => ({ error: null })),
      };
    }),
  };
}

import { GET as collectionGET, POST as collectionPOST } from '@/app/api/org/[orgId]/grants/route';
import { GET as detailGET, PATCH as detailPATCH } from '@/app/api/org/[orgId]/grants/[grantId]/route';

const ORG_ID = 'org-1';
const GRANT_ID = 'grant-1';

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeParams(p: Record<string, string>) {
  return { params: Promise.resolve(p) } as any;
}

beforeEach(() => {
  _authUser = { id: 'user-1' };
  _orgRole = 'admin';
  _createGrantResult = {
    data: {
      grant: { id: 'grant-1', lifecycle_stage: 'draft' },
      holding: { id: 'holding-1', name: 'Test Grantee' },
      workflow_instance: null,
    },
    error: null,
  };
  _portfolioData = { id: 'port-1', org_id: ORG_ID };
  _investeeData = { id: 'inv-1', display_name: 'Test Grantee' };
});

describe('GET /api/org/[orgId]/grants', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = makeReq('GET', `http://localhost/api/org/${ORG_ID}/grants`);
    const res = await collectionGET(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not a member', async () => {
    _orgRole = null;
    const req = makeReq('GET', `http://localhost/api/org/${ORG_ID}/grants`);
    const res = await collectionGET(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with data array for authenticated member', async () => {
    _orgRole = 'member';
    const req = makeReq('GET', `http://localhost/api/org/${ORG_ID}/grants`);
    const res = await collectionGET(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.pagination).toBeDefined();
  });
});

describe('POST /api/org/[orgId]/grants', () => {
  const validBody = {
    portfolio_id: 'port-1',
    investee_id: 'inv-1',
    purpose: 'Education programs',
    requested_amount: 100000,
  };

  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = makeReq('POST', `http://localhost/api/org/${ORG_ID}/grants`, validBody);
    const res = await collectionPOST(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    _orgRole = 'viewer';
    const req = makeReq('POST', `http://localhost/api/org/${ORG_ID}/grants`, validBody);
    const res = await collectionPOST(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(403);
  });

  it('returns 422 when neither investee_id nor new_grantee is provided', async () => {
    const req = makeReq('POST', `http://localhost/api/org/${ORG_ID}/grants`, {
      portfolio_id: 'port-1',
      purpose: 'Test',
      requested_amount: 5000,
    });
    const res = await collectionPOST(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(422);
  });

  it('returns 201 with grant and holding when body is valid (investee_id path)', async () => {
    const req = makeReq('POST', `http://localhost/api/org/${ORG_ID}/grants`, validBody);
    const res = await collectionPOST(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.grant).toBeDefined();
    expect(json.holding).toBeDefined();
  });

  it('returns 201 with grant and holding when body is valid (new_grantee path)', async () => {
    const req = makeReq('POST', `http://localhost/api/org/${ORG_ID}/grants`, {
      portfolio_id: 'port-1',
      new_grantee: { display_name: 'New Org', ein: '12-3456789' },
      purpose: 'Health',
      requested_amount: 50000,
    });
    const res = await collectionPOST(req, makeParams({ orgId: ORG_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.grant).toBeDefined();
    expect(json.holding).toBeDefined();
  });
});

describe('GET /api/org/[orgId]/grants/[grantId]', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = makeReq('GET', `http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}`);
    const res = await detailGET(req, makeParams({ orgId: ORG_ID, grantId: GRANT_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when not a member', async () => {
    _orgRole = null;
    const req = makeReq('GET', `http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}`);
    const res = await detailGET(req, makeParams({ orgId: ORG_ID, grantId: GRANT_ID }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/org/[orgId]/grants/[grantId]', () => {
  it('returns 422 when lifecycle_stage is in the body', async () => {
    const req = makeReq('PATCH', `http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}`, {
      lifecycle_stage: 'approved',
    });
    const res = await detailPATCH(req, makeParams({ orgId: ORG_ID, grantId: GRANT_ID }));
    expect(res.status).toBe(422);
  });

  it('returns 200 with updated data for valid patchable fields', async () => {
    const req = makeReq('PATCH', `http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}`, {
      purpose: 'Education',
    });
    const res = await detailPATCH(req, makeParams({ orgId: ORG_ID, grantId: GRANT_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
  });
});
// Integration test.
