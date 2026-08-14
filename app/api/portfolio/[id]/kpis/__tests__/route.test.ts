// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateSb, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockCreateSb: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/server-client', () => ({
  createServerClient: mockCreateSb,
}));

import { GET } from '@/app/api/portfolio/[id]/kpis/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateSb.mockResolvedValue({ rpc: mockRpc, from: mockFrom });
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe('portfolio KPI definitions', () => {
  it('returns every active configured definition, including KPIs without facts', async () => {
    const portfolioQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { org_id: 'org-1' }, error: null } }
    );
    const definitionsQuery = stubQuery({
      data: [
        { slug: 'jobs_created', name: 'Jobs created', target_value: 100, display_order: 1 },
        { slug: 'people_served', name: 'People served', target_value: null, display_order: 2 },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(portfolioQuery).mockReturnValueOnce(definitionsQuery);

    const response = await GET(
      new Request('http://localhost/api/portfolio/portfolio-1/kpis?definitions=true'),
      { params: Promise.resolve({ id: 'portfolio-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('can_view_portfolio', {
      p_portfolio_id: 'portfolio-1',
    });
    expect(definitionsQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(definitionsQuery.calls).toContainEqual({ method: 'eq', args: ['is_active', true] });
    expect(await response.json()).toEqual({
      data: [
        {
          metric_code: 'jobs_created',
          display_name: 'Jobs created',
          target_value: 100,
          order_index: 1,
        },
        {
          metric_code: 'people_served',
          display_name: 'People served',
          target_value: null,
          order_index: 2,
        },
      ],
      count: 2,
      nextOffset: null,
    });
  });

  it('rejects unauthorized definition reads before querying the catalog', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    const response = await GET(
      new Request('http://localhost/api/portfolio/portfolio-1/kpis?definitions=true'),
      { params: Promise.resolve({ id: 'portfolio-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
