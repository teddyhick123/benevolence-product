// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockRequireOrgAccess,
  mockRpc,
  mockFrom,
  mockCreatePledgeRepository,
  mockCancelPledge,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockCreatePledgeRepository: vi.fn(),
  mockCancelPledge: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/pledges', () => ({
  createPledgeRepository: mockCreatePledgeRepository,
}));

import { POST as cancelPledge } from '@/app/api/org/[orgId]/pledges/[pledgeId]/cancel/route';
import { PATCH as updateInstallment } from '@/app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route';

const context = {
  orgId: 'org-1',
  role: 'admin',
  user: { id: 'admin-1' },
  principal: { kind: 'user', userId: 'admin-1' },
  db: { rpc: mockRpc, from: mockFrom },
};
const cancelParams = {
  params: Promise.resolve({ orgId: 'org-1', pledgeId: 'pledge-1' }),
};
const installmentParams = {
  params: Promise.resolve({
    orgId: 'org-1',
    pledgeId: 'pledge-1',
    installmentId: 'installment-1',
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockCreatePledgeRepository.mockReturnValue({
    cancelPledge: mockCancelPledge,
  });
  mockCancelPledge.mockResolvedValue({
    data: { waived_count: 2, cancelled_task_count: 3 },
    error: null,
  });
});

describe('pledge mutation routes', () => {
  it('returns the shared denial before constructing cancellation access', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await cancelPledge(new NextRequest(
      'http://localhost/api/org/org-1/pledges/pledge-1/cancel',
      { method: 'POST', body: '{}' }
    ), cancelParams);

    expect(response.status).toBe(403);
    expect(mockCreatePledgeRepository).not.toHaveBeenCalled();
  });

  it('requires admin access and passes only scoped cancellation inputs', async () => {
    const response = await cancelPledge(new NextRequest(
      'http://localhost/api/org/org-1/pledges/pledge-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({
          cancellation_reason: 'Donor request',
          waive_pending: true,
        }),
      }
    ), cancelParams);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(mockCreatePledgeRepository).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'admin-1',
    });
    expect(mockCancelPledge).toHaveBeenCalledWith({
      pledgeId: 'pledge-1',
      cancellationReason: 'Donor request',
      waivePending: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      waived_count: 2,
      cancelled_task_count: 3,
    });
  });

  it('updates an installment through the authorized session and scopes refresh reads', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, installment_id: 'installment-1' },
      error: null,
    });
    const pledgeQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'pledge-1' }, error: null } }
    );
    const installmentQuery = stubQuery({
      data: [{ id: 'installment-1', status: 'waived' }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(pledgeQuery).mockReturnValueOnce(installmentQuery);

    const response = await updateInstallment(new NextRequest(
      'http://localhost/api/org/org-1/pledges/pledge-1/installments/installment-1',
      { method: 'PATCH', body: JSON.stringify({ action: 'waive' }) }
    ), installmentParams);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
    expect(mockRpc).toHaveBeenCalledWith('update_pledge_installment_status',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_pledge_id: 'pledge-1',
        p_installment_id: 'installment-1',
        p_action: 'waive',
      })
    );
    expect(mockCreatePledgeRepository).not.toHaveBeenCalled();
    for (const query of [pledgeQuery, installmentQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
