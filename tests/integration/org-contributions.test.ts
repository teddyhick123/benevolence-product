// Behavior of GET/POST /api/org/[orgId]/contributions.
//
// Route facts confirmed by reading the source:
//   - GET uses the shared org guard at the default `viewer` level; POST requires
//     `member`.
//   - Donor contact details are selected only for `member` and above, matching
//     the stricter stance /donors already takes on donor PII.
//   - contributions_received.donor_id is NOT NULL, so an anonymous gift mints a
//     dedicated is_anonymous donor rather than writing a null donor.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';
const DONOR_ID = '66666666-6666-6666-6666-666666666666';
const ANON_DONOR_ID = '77777777-7777-7777-7777-777777777777';

let _actorRole = 'member';
let _contributionError: { message: string } | null = null;
let _donorLookupResult: { id: string } | null = { id: DONOR_ID };

// Recorded so each test can assert on what the route actually asked the DB for.
let _selectedColumns: string[] = [];
let _donorInserts: Array<Record<string, unknown>> = [];
let _donorDeletes: string[] = [];
let _contributionInsert: Record<string, unknown> | null = null;

const { mockFrom, mockRequireOrgAccess } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireOrgAccess: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

function setupMocks() {
  mockRequireOrgAccess.mockImplementation(async (orgId: string, minRole?: string) => {
    const ranks = ['viewer', 'member', 'admin', 'owner'];
    if (minRole && ranks.indexOf(_actorRole) < ranks.indexOf(minRole)) {
      return { ok: false, response: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) };
    }
    return {
      ok: true,
      context: {
        orgId,
        role: _actorRole,
        principal: { kind: 'user', userId: ACTOR_ID },
        db: { from: mockFrom },
      },
    };
  });

  mockFrom.mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn((columns?: string) => {
        if (columns) _selectedColumns.push(columns);
        return chain;
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'donors') _donorInserts.push(payload);
        if (table === 'contributions_received') _contributionInsert = payload;
        return chain;
      }),
      delete: vi.fn(() => {
        chain._deleting = true;
        return chain;
      }),
      eq: vi.fn((column: string, value: string) => {
        if (chain._deleting && table === 'donors' && column === 'id') _donorDeletes.push(value);
        return chain;
      }),
      is: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      range: vi.fn(() => chain),
      single: vi.fn(async () => {
        if (table === 'donors') return { data: { id: ANON_DONOR_ID }, error: null };
        return {
          data: _contributionError ? null : { id: 'contribution-1', donor_id: DONOR_ID, amount: 100 },
          error: _contributionError,
        };
      }),
      maybeSingle: vi.fn(async () => ({ data: _donorLookupResult, error: null })),
      then: (resolve: (_r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  });
}

beforeEach(() => {
  _actorRole = 'member';
  _contributionError = null;
  _donorLookupResult = { id: DONOR_ID };
  _selectedColumns = [];
  _donorInserts = [];
  _donorDeletes = [];
  _contributionInsert = null;
  mockFrom.mockClear();
  mockRequireOrgAccess.mockClear();
  setupMocks();
});

function postRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/org/${ORG_ID}/contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest(`http://localhost/api/org/${ORG_ID}/contributions`, { method: 'GET' });
}

const ctx = { params: Promise.resolve({ orgId: ORG_ID }) };

describe('GET /api/org/[orgId]/contributions — donor PII', () => {
  it('withholds donor contact details from viewers', async () => {
    const { GET } = await import('@/app/api/org/[orgId]/contributions/route');
    _actorRole = 'viewer';

    await GET(getRequest(), ctx);

    const donorSelect = _selectedColumns.find(columns => columns.includes('donors('));
    expect(donorSelect).toBeDefined();
    expect(donorSelect).not.toContain('email');
    expect(donorSelect).not.toContain('address_line1');
    expect(donorSelect).not.toContain('zip');
  });

  it('still gives viewers the donor display name so the list stays usable', async () => {
    const { GET } = await import('@/app/api/org/[orgId]/contributions/route');
    _actorRole = 'viewer';

    await GET(getRequest(), ctx);

    const donorSelect = _selectedColumns.find(columns => columns.includes('donors('));
    expect(donorSelect).toContain('first_name');
    expect(donorSelect).toContain('organization_name');
  });

  it('gives members the contact details receipt generation needs', async () => {
    const { GET } = await import('@/app/api/org/[orgId]/contributions/route');
    _actorRole = 'member';

    await GET(getRequest(), ctx);

    const donorSelect = _selectedColumns.find(columns => columns.includes('donors('));
    expect(donorSelect).toContain('email');
    expect(donorSelect).toContain('address_line1');
    expect(donorSelect).toContain('zip');
  });
});

describe('POST /api/org/[orgId]/contributions — anonymous gifts', () => {
  it('mints a dedicated anonymous donor when no donor is supplied', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');

    const res = await POST(postRequest({ amount: 100, is_anonymous: true }), ctx);

    expect(res.status).toBe(201);
    expect(_donorInserts).toEqual([{ org_id: ORG_ID, is_anonymous: true }]);
    expect(_contributionInsert).toMatchObject({ donor_id: ANON_DONOR_ID });
  });

  it('creates a separate donor per anonymous gift rather than reusing one', async () => {
    // A shared per-org anonymous donor would merge unrelated givers into a
    // single, meaningless lifetime-giving total.
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');

    await POST(postRequest({ amount: 100, is_anonymous: true }), ctx);
    await POST(postRequest({ amount: 250, is_anonymous: true }), ctx);

    expect(_donorInserts).toHaveLength(2);
    for (const insert of _donorInserts) {
      expect(insert).toMatchObject({ org_id: ORG_ID, is_anonymous: true });
    }
  });

  it('removes the anonymous donor if the contribution insert then fails', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');
    _contributionError = { message: 'insert failed' };

    const res = await POST(postRequest({ amount: 100, is_anonymous: true }), ctx);

    expect(res.status).toBe(500);
    expect(_donorDeletes).toEqual([ANON_DONOR_ID]);
  });

  it('does not delete a real donor when the contribution insert fails', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');
    _contributionError = { message: 'insert failed' };

    await POST(postRequest({ amount: 100, donor_id: DONOR_ID }), ctx);

    expect(_donorDeletes).toEqual([]);
  });

  it('still rejects a missing donor that is not flagged anonymous', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');

    const res = await POST(postRequest({ amount: 100 }), ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/donor_id is required/i);
    expect(_donorInserts).toEqual([]);
  });

  it('rejects a donor belonging to another organization', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');
    _donorLookupResult = null;

    const res = await POST(postRequest({ amount: 100, donor_id: DONOR_ID }), ctx);

    expect(res.status).toBe(400);
    expect(_contributionInsert).toBeNull();
  });

  it('denies a viewer entirely', async () => {
    const { POST } = await import('@/app/api/org/[orgId]/contributions/route');
    _actorRole = 'viewer';

    const res = await POST(postRequest({ amount: 100, is_anonymous: true }), ctx);

    expect(res.status).toBe(403);
    expect(_donorInserts).toEqual([]);
  });
});
