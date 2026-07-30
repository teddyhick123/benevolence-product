// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockRequireOrgAccess, mockFrom, mockGetOrgEnabledModules } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockGetOrgEnabledModules: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/modules', () => ({
  getOrgEnabledModules: mockGetOrgEnabledModules,
}));

import { GET } from '@/app/api/org/[orgId]/dashboard/route';

const queries: Array<{ table: string; query: ReturnType<typeof stubQuery> }> = [];
const db = { from: mockFrom };
const params = { params: Promise.resolve({ orgId: 'org-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: {
      orgId: 'org-1',
      role: 'viewer',
      user: { id: 'member-1' },
      db,
    },
  });
  mockGetOrgEnabledModules.mockResolvedValue(['core']);
  mockFrom.mockImplementation((table: string) => {
    const query = table === 'organizations'
      ? stubQuery(
          { data: null, error: null },
          {
            single: {
              data: {
                id: 'org-1',
                name: 'Example Foundation',
                branding: {},
                org_type_config: {},
                ein: null,
                org_type: 'private_foundation',
                website: null,
                created_at: '2026-01-01',
              },
              error: null,
            },
          }
        )
      : stubQuery({ data: [], error: null, count: 0 } as never);
    queries.push({ table, query });
    return query;
  });
});

describe('organization dashboard route', () => {
  it('returns the shared denial before any dashboard reads', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(new NextRequest('http://localhost/api/org/org-1/dashboard'), params);

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('uses the authorized session for org-scoped dashboard data', async () => {
    const response = await GET(new NextRequest('http://localhost/api/org/org-1/dashboard'), params);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(expect.objectContaining({
      org: expect.objectContaining({ id: 'org-1', name: 'Example Foundation' }),
      user_role: 'viewer',
      stats: expect.objectContaining({ members_count: 0, linked_holdings: 0 }),
    }));
    expect(mockGetOrgEnabledModules).toHaveBeenCalledWith(db, 'org-1');

    const organizationQuery = queries.find(({ table }) => table === 'organizations')?.query;
    expect(organizationQuery?.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] });
    for (const { table, query } of queries.filter(({ table }) =>
      ['organization_members', 'holdings', 'donors', 'import_jobs'].includes(table)
    )) {
      expect(query.calls, table).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
  });
});
