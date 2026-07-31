// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockRequirePortfolioAccess,
  mockFrom,
  mockCreateGrantRepository,
  mockSyncMilestoneTasks,
} = vi.hoisted(() => ({
  mockRequirePortfolioAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateGrantRepository: vi.fn(),
  mockSyncMilestoneTasks: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/grants', () => ({
  createGrantRepository: mockCreateGrantRepository,
}));

import { PATCH } from '@/app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route';

const params = {
  params: Promise.resolve({
    id: 'portfolio-1',
    holdingId: 'holding-1',
    milestoneId: 'milestone-1',
  }),
};

function request(body: Record<string, unknown>) {
  return new NextRequest(
    'http://localhost/api/portfolio/portfolio-1/holdings/holding-1/milestones/milestone-1',
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePortfolioAccess.mockResolvedValue({
    ok: true,
    context: {
      portfolioId: 'portfolio-1',
      orgId: 'org-1',
      role: 'member',
      user: { id: 'member-1' },
      db: { from: mockFrom },
    },
  });
  mockCreateGrantRepository.mockReturnValue({ syncMilestoneTasks: mockSyncMilestoneTasks });
  mockSyncMilestoneTasks.mockResolvedValue(undefined);
});

describe('portfolio milestone detail route', () => {
  it('returns the shared denial before reading the milestone', async () => {
    mockRequirePortfolioAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
    });

    const response = await PATCH(request({ status: 'completed' }), params);

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a milestone whose parent grant does not match the URL holding', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      {
        single: {
          data: {
            id: 'milestone-1',
            grant_id: 'grant-1',
            grants: { holding_id: 'holding-2', portfolio_id: 'portfolio-1' },
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(lookup);

    const response = await PATCH(request({ status: 'completed' }), params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Milestone does not belong to this holding',
    });
    expect(mockSyncMilestoneTasks).not.toHaveBeenCalled();
  });

  it('updates through the session and scopes generated-task sync to the authorized org', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      {
        single: {
          data: {
            id: 'milestone-1',
            grant_id: 'grant-1',
            grants: { holding_id: 'holding-1', portfolio_id: 'portfolio-1' },
          },
          error: null,
        },
      }
    );
    const update = stubQuery(
      { data: null, error: null },
      {
        single: {
          data: {
            id: 'milestone-1',
            milestone_name: 'Final report',
            status: 'completed',
            due_date: '2026-09-01',
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(update);

    const response = await PATCH(request({ status: 'completed' }), params);

    expect(mockRequirePortfolioAccess).toHaveBeenCalledWith('portfolio-1', 'member');
    expect(mockCreateGrantRepository).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'member-1',
    });
    expect(mockSyncMilestoneTasks).toHaveBeenCalledWith({
      milestoneId: 'milestone-1',
      status: 'completed',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: expect.objectContaining({ id: 'milestone-1', status: 'completed' }),
    });
  });
});
