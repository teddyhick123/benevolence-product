// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockRequireOrgAccess,
  mockFrom,
  mockCreateWorkflowRepository,
  mockStartWorkflow,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateWorkflowRepository: vi.fn(),
  mockStartWorkflow: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/workflows', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/repositories/workflows')>();
  return { ...actual, createWorkflowRepository: mockCreateWorkflowRepository };
});

import { GET, POST } from '@/app/api/org/[orgId]/workflows/route';

const context = {
  orgId: 'org-1',
  role: 'admin',
  user: { id: 'admin-1' },
  principal: { kind: 'user', userId: 'admin-1' },
  db: { from: mockFrom },
};
const params = { params: Promise.resolve({ orgId: 'org-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockCreateWorkflowRepository.mockReturnValue({ startWorkflow: mockStartWorkflow });
  mockStartWorkflow.mockResolvedValue({ id: 'workflow-1' });
});

describe('workflow instance route', () => {
  it('returns the shared denial before workflow reads', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/workflows'),
      params
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('scopes workflow listing and an optional portfolio filter to the org', async () => {
    const portfolioQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'portfolio-1' }, error: null } }
    );
    const workflowQuery = stubQuery({ data: [{ id: 'workflow-1' }], error: null });
    mockFrom.mockReturnValueOnce(portfolioQuery).mockReturnValueOnce(workflowQuery);

    const response = await GET(new NextRequest(
      'http://localhost/api/org/org-1/workflows?portfolio_id=portfolio-1&status=active'
    ), params);

    expect(portfolioQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(workflowQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(workflowQuery.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('requires admin access and passes validated creation to a scoped repository', async () => {
    const response = await POST(new NextRequest(
      'http://localhost/api/org/org-1/workflows',
      {
        method: 'POST',
        body: JSON.stringify({
          template_id: '11111111-1111-4111-8111-111111111111',
          portfolio_id: '22222222-2222-4222-8222-222222222222',
        }),
      }
    ), params);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(mockCreateWorkflowRepository).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'admin-1',
    });
    expect(mockStartWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      template_id: '11111111-1111-4111-8111-111111111111',
      portfolio_id: '22222222-2222-4222-8222-222222222222',
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ workflow: { id: 'workflow-1' } });
  });
});
