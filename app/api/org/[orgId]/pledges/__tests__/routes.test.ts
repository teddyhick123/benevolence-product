// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockRequireOrgAccess, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

import { GET as listPledges, POST as createPledge } from '@/app/api/org/[orgId]/pledges/route';
import {
  DELETE as deletePledge,
  GET as getPledge,
} from '@/app/api/org/[orgId]/pledges/[pledgeId]/route';

const context = {
  orgId: 'org-1',
  role: 'member',
  user: { id: 'member-1' },
  principal: { kind: 'user', userId: 'member-1' },
  db: { rpc: mockRpc, from: mockFrom },
};
const orgParams = { params: Promise.resolve({ orgId: 'org-1' }) };
const pledgeParams = {
  params: Promise.resolve({ orgId: 'org-1', pledgeId: 'pledge-1' }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
});

describe('pledge routes', () => {
  it('returns the shared denial before listing pledge data', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await listPledges(
      new NextRequest('http://localhost/api/org/org-1/pledges'),
      orgParams
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('lists pledge and attention rows inside the authorized org', async () => {
    const listQuery = stubQuery({ data: [], error: null, count: 0 } as never);
    const attentionQuery = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValueOnce(listQuery).mockReturnValueOnce(attentionQuery);
    mockRpc.mockResolvedValue({
      data: { kpis: { committed: 100 }, aging: {}, forecast: [] },
      error: null,
    });

    const response = await listPledges(
      new NextRequest('http://localhost/api/org/org-1/pledges?limit=25'),
      orgParams
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
    for (const query of [listQuery, attentionQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
    expect(mockRpc).toHaveBeenCalledWith('get_pledge_dashboard_metrics', {
      p_org_id: 'org-1',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('creates through the session RPC and scopes returned records to the org', async () => {
    mockRpc.mockResolvedValue({ data: { pledge_id: 'pledge-1' }, error: null });
    const pledgeQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'pledge-1' }, error: null } }
    );
    const installmentQuery = stubQuery({ data: [{ id: 'installment-1' }], error: null });
    mockFrom.mockReturnValueOnce(pledgeQuery).mockReturnValueOnce(installmentQuery);

    const response = await createPledge(new NextRequest(
      'http://localhost/api/org/org-1/pledges',
      {
        method: 'POST',
        body: JSON.stringify({
          donor_id: '11111111-1111-4111-8111-111111111111',
          total_amount: 100,
          currency: 'USD',
          start_date: '2026-08-01',
          frequency: 'one_time',
          commitment_type: 'written',
          installments: [{ due_date: '2026-08-01', amount: 100 }],
        }),
      }
    ), orgParams);

    expect(mockRpc).toHaveBeenCalledWith('create_pledge_with_installments',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_donor_id: '11111111-1111-4111-8111-111111111111',
      })
    );
    for (const query of [pledgeQuery, installmentQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
    expect(response.status).toBe(201);
  });

  it('scopes every pledge detail relation to the authorized org', async () => {
    const pledgeQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'pledge-1' }, error: null } }
    );
    const installmentQuery = stubQuery({ data: [], error: null });
    const eventQuery = stubQuery({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(pledgeQuery)
      .mockReturnValueOnce(installmentQuery)
      .mockReturnValueOnce(eventQuery);

    const response = await getPledge(
      new NextRequest('http://localhost/api/org/org-1/pledges/pledge-1'),
      pledgeParams
    );

    for (const query of [pledgeQuery, installmentQuery, eventQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
    expect(response.status).toBe(200);
  });

  it('requires admin access and records the authenticated actor on deletion', async () => {
    const deleteQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(deleteQuery);

    const response = await deletePledge(new NextRequest(
      'http://localhost/api/org/org-1/pledges/pledge-1',
      { method: 'DELETE' }
    ), pledgeParams);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(deleteQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      deleted_by: 'member-1',
    }));
    expect(deleteQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(response.status).toBe(200);
  });
});
