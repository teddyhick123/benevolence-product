// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockRequirePortfolioAccess, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockRequirePortfolioAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

import { GET } from '@/app/api/portfolio/[id]/map/route';

const db = { from: mockFrom, rpc: mockRpc };
const context = { params: Promise.resolve({ id: 'portfolio-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePortfolioAccess.mockResolvedValue({
    ok: true,
    context: {
      portfolioId: 'portfolio-1',
      orgId: 'org-1',
      role: 'viewer',
      user: { id: 'member-1' },
      db,
    },
  });
  mockFrom.mockReturnValue(stubQuery({ data: [], error: null }));
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe('portfolio map route', () => {
  it('returns the shared denial before reading map data, including in debug mode', async () => {
    mockRequirePortfolioAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
    });

    const response = await GET(
      new Request('http://localhost/api/portfolio/portfolio-1/map?debug=1'),
      context
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('scopes both map tables to the authorized portfolio and omits privileged diagnostics', async () => {
    const holdingsQuery = stubQuery({ data: [], error: null });
    const locationsQuery = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValueOnce(holdingsQuery).mockReturnValueOnce(locationsQuery);

    const response = await GET(
      new Request('http://localhost/api/portfolio/portfolio-1/map?debug=1'),
      context
    );

    expect(mockRequirePortfolioAccess).toHaveBeenCalledWith('portfolio-1');
    expect(holdingsQuery.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(locationsQuery.calls).toContainEqual({
      method: 'eq',
      args: ['portfolio_id', 'portfolio-1'],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      points: [],
      count: 0,
      portfolio_id_echo: 'portfolio-1',
    });
  });
});
