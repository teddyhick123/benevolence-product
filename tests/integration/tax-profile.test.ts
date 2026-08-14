// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, PUT } from '@/app/api/portfolio/[id]/tax/profile/route';

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PORTFOLIO_ID = '22222222-2222-2222-2222-222222222222';
const PROFILE_ID = '33333333-3333-3333-3333-333333333333';

let _canView = true;
let _canEdit = true;
let _profile: any;
let _created: any;
let _updated: any;
let _taxYearError: { message: string } | null;
let _rollbackError: { message: string } | null;
let _capturedInsert: any;
let _capturedTaxYearUpsert: any;
let _deleteCalls: Array<{ method: string; args: unknown[] }>;
let _rollbackUpdate: any;

const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();

function responseError(message: string, status: number, reason: string) {
  return {
    ok: false,
    reason,
    response: Response.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } }
    ),
  };
}

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (
    portfolioId: string,
    minRole: 'viewer' | 'member' = 'viewer'
  ) => {
    const allowed = minRole === 'member' ? _canEdit : _canView;
    if (!allowed) return responseError('Access denied', 403, 'forbidden');
    return {
      ok: true,
      context: {
        db: { from: mockFrom },
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

vi.mock('@/lib/api/server-client', () => ({
  supabasePublic: vi.fn(async () => ({
    rpc: vi.fn(async (name: string) => ({
      data: name === 'can_edit_portfolio' ? _canEdit : _canView,
      error: null,
    })),
    from: mockFrom,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

function taxProfileBuilder() {
  let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let selectedAfterWrite = false;
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: any = {
    select: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'select', args });
      selectedAfterWrite = operation === 'insert' || operation === 'update';
      return builder;
    }),
    insert: vi.fn((value: unknown) => {
      operation = 'insert';
      _capturedInsert = value;
      return builder;
    }),
    update: vi.fn((value: unknown) => {
      operation = 'update';
      _rollbackUpdate = value;
      return builder;
    }),
    delete: vi.fn(() => {
      operation = 'delete';
      return builder;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      if (operation === 'delete') _deleteCalls = calls;
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({ data: _profile, error: null })),
    single: vi.fn(async () => {
      if (operation === 'insert') return { data: _created, error: null };
      if (operation === 'update' && selectedAfterWrite) return { data: _updated, error: null };
      return { data: _profile, error: null };
    }),
    then: (resolve: (_value: unknown) => unknown) => resolve({
      data: null,
      error: operation === 'delete' || (operation === 'update' && !selectedAfterWrite)
        ? _rollbackError
        : null,
    }),
  };
  return builder;
}

function adminBuilder() {
  const builder: any = {
    upsert: vi.fn((value: unknown) => {
      _capturedTaxYearUpsert = value;
      return builder;
    }),
    then: (resolve: (_value: unknown) => unknown) => resolve({
      data: null,
      error: _taxYearError,
    }),
  };
  return builder;
}

function request(method: 'GET' | 'POST' | 'PUT', body?: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/profile?year=2024`,
    {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

function context() {
  return { params: Promise.resolve({ id: PORTFOLIO_ID }) };
}

const CREATE_BODY = {
  portfolio_id: PORTFOLIO_ID,
  tax_year: 2024,
  filing_status: 'single',
  estimated_agi: 250_000,
  carryforward_from_prior: 0,
};

beforeEach(() => {
  _canView = true;
  _canEdit = true;
  _profile = { id: PROFILE_ID, ...CREATE_BODY };
  _created = { id: PROFILE_ID, ...CREATE_BODY };
  _updated = { id: PROFILE_ID, ...CREATE_BODY, estimated_agi: 300_000 };
  _taxYearError = null;
  _rollbackError = null;
  _capturedInsert = null;
  _capturedTaxYearUpsert = null;
  _deleteCalls = [];
  _rollbackUpdate = null;
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'tax_profiles') throw new Error(`Unexpected table ${table}`);
    return taxProfileBuilder();
  });
  mockAdminFrom.mockImplementation((table: string) => {
    if (table !== 'tax_years') throw new Error(`Unexpected admin table ${table}`);
    return adminBuilder();
  });
});

describe('tax profile route contract', () => {
  it('allows a viewer to fetch a portfolio-scoped profile', async () => {
    const response = await GET(request('GET'), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: _profile });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 403 before profile reads when portfolio access is denied', async () => {
    _canView = false;

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a body portfolio that differs from the URL scope', async () => {
    const response = await POST(request('POST', {
      ...CREATE_BODY,
      portfolio_id: OTHER_PORTFOLIO_ID,
    }), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Portfolio ID mismatch' });
    expect(_capturedInsert).toBeNull();
  });

  it('creates a profile and synchronizes the canonical tax year', async () => {
    const response = await POST(request('POST', CREATE_BODY), context());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: _created });
    expect(_capturedTaxYearUpsert).toEqual({
      portfolio_id: PORTFOLIO_ID,
      tax_year: 2024,
      adjusted_gross_income: 250_000,
      filing_status: 'single',
    });
  });

  it('rolls profile creation back when canonical tax-year sync fails', async () => {
    _taxYearError = { message: 'tax year sync failed' };
    _rollbackError = { message: 'rollback failed' };

    const response = await POST(request('POST', CREATE_BODY), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'tax year sync failed',
      rollback_error: 'rollback failed',
    });
    expect(_deleteCalls).toContainEqual({ method: 'eq', args: ['id', PROFILE_ID] });
    expect(_deleteCalls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', PORTFOLIO_ID],
    });
  });

  it('updates a profile and synchronizes the canonical tax year', async () => {
    const response = await PUT(
      request('PUT', { estimated_agi: 300_000 }),
      context()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: _updated });
    expect(_capturedTaxYearUpsert).toEqual({
      portfolio_id: PORTFOLIO_ID,
      tax_year: 2024,
      adjusted_gross_income: 300_000,
      filing_status: 'single',
    });
  });
});
