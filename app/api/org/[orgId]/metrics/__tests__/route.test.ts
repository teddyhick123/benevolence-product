// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockRequireOrgAccess, mockFrom } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

import { GET, POST } from '@/app/api/org/[orgId]/metrics/route';

const accessGranted = {
  ok: true,
  context: {
    orgId: 'org-1',
    role: 'member',
    user: { id: 'member-1' },
    db: { from: mockFrom },
  },
};

const params = { params: Promise.resolve({ orgId: 'org-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue(accessGranted);
});

describe('organization metrics route', () => {
  it('returns the shared denial before querying metric data', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(new NextRequest('http://localhost/api/org/org-1/metrics'), params);

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('scopes pending and approved metric reads to the authorized organization', async () => {
    const pendingQuery = stubQuery({ data: [{ id: 'pending-1' }], error: null });
    const approvedQuery = stubQuery({ data: [{ id: 'approved-1' }], error: null });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(approvedQuery);

    const response = await GET(new NextRequest('http://localhost/api/org/org-1/metrics'), params);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      pending: [{ id: 'pending-1' }],
      approved: [{ id: 'approved-1' }],
    });
    expect(pendingQuery.calls).toContainEqual({
      method: 'eq',
      args: ['submitted_by_org_id', 'org-1'],
    });
    expect(approvedQuery.calls).toContainEqual({
      method: 'eq',
      args: ['submitted_by_org_id', 'org-1'],
    });
  });

  it('requires member access and scopes the holding before staging a manual metric', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'holding-1', portfolio_id: 'portfolio-1' }, error: null } }
    );
    const metricQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { code: 'PEOPLE_SERVED', unit: 'people' }, error: null } }
    );
    const insertQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'fact-1', value: 0 }, error: null } }
    );
    mockFrom
      .mockReturnValueOnce(holdingQuery)
      .mockReturnValueOnce(metricQuery)
      .mockReturnValueOnce(insertQuery);

    const response = await POST(new NextRequest('http://localhost/api/org/org-1/metrics', {
      method: 'POST',
      body: JSON.stringify({
        holding_id: 'holding-1',
        metric_code: 'PEOPLE_SERVED',
        value: 0,
      }),
    }), params);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'holding-1'] });
    expect(insertQuery.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        holding_id: 'holding-1',
        metric_code: 'PEOPLE_SERVED',
        value: 0,
        submitted_by_org_id: 'org-1',
        approved: false,
      })],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'fact-1', value: 0 });
  });
});
