import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID  = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';
let _counts: Record<string, number> = { overdue: 3, due_soon: 5, blocked: 1, mine: 7, total_open: 12 };
let _countError: { message: string } | null = null;

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

const ORDER = ['overdue', 'due_soon', 'blocked', 'mine', 'total_open'] as const;
let _callIndex = 0;

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  _callIndex = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'tasks') {
      const idx = _callIndex++;
      const key = ORDER[idx] ?? 'total_open';
      const countVal = _counts[key] ?? 0;
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        lt:     vi.fn(() => b),
        gte:    vi.fn(() => b),
        lte:    vi.fn(() => b),
        not:    vi.fn(() => b),
        is:     vi.fn(() => b),
        then:   vi.fn(async (resolve: Function) => resolve({ count: _countError ? null : countVal, error: _countError })),
      };
      return b;
    }
    return { select: vi.fn().mockReturnThis() };
  });
}

beforeEach(() => {
  _authUser   = { id: USER_ID };
  _orgRole    = 'admin';
  _counts     = { overdue: 3, due_soon: 5, blocked: 1, mine: 7, total_open: 12 };
  _countError = null;
  setupMocks();
});

function makeRequest(orgId = ORG_ID) {
  return new NextRequest(`http://localhost/api/org/${orgId}/tasks/summary`);
}
function makeParams(orgId = ORG_ID) {
  return { params: Promise.resolve({ orgId }) };
}

import { GET } from '@/app/api/org/[orgId]/tasks/summary/route';

describe('GET /api/org/[orgId]/tasks/summary — auth', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body).toHaveProperty('error');
  });

  it('returns 403 when user is not a member of the org', async () => {
    _orgRole = null;
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
  });
});

describe('GET /api/org/[orgId]/tasks/summary — contract', () => {
  it('returns { overdue, due_soon, blocked, mine, total_open } with correct values', async () => {
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      overdue:    3,
      due_soon:   5,
      blocked:    1,
      mine:       7,
      total_open: 12,
    });
  });

  it('returns zeros when all counts are 0', async () => {
    _counts = { overdue: 0, due_soon: 0, blocked: 0, mine: 0, total_open: 0 };
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.overdue).toBe(0);
    expect(body.total_open).toBe(0);
  });

  it('returns 500 when a count query errors', async () => {
    _countError = { message: 'relation "tasks" does not exist' };
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });
});
