// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/portfolio/[id]/tax/export/route';
import { stubQuery, stubSupabase } from '@/tests/helpers/supabase-mock';

const { mockRequirePortfolioAccess, mockSupabasePublic } = vi.hoisted(() => ({
  mockRequirePortfolioAccess: vi.fn(),
  mockSupabasePublic: vi.fn(),
}));

function denied(message: string, status: number) {
  const response = Response.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
  return { ok: false, response, error: response };
}

vi.mock('@/lib/portfolio-auth', () => ({
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: vi.fn((result: { ok?: boolean; error?: Response }) =>
    result.ok === false || 'error' in result
  ),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: mockRequirePortfolioAccess,
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

vi.mock('@/lib/supabase', () => ({
  supabasePublic: mockSupabasePublic,
}));

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
let db: ReturnType<typeof stubSupabase>;
let tableQueries: Record<string, ReturnType<typeof stubQuery>[]>;

function trackedQuery(
  table: string,
  data: unknown,
  terminal: 'then' | 'single' = 'then'
) {
  const result = { data, error: null };
  const query = terminal === 'single'
    ? stubQuery(result, { single: result })
    : stubQuery(result);
  tableQueries[table] ??= [];
  tableQueries[table].push(query);
  return query;
}

function request(format = 'json') {
  return new Request(
    `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/export?year=2024&format=${format}`
  );
}

function context() {
  return { params: Promise.resolve({ id: PORTFOLIO_ID }) };
}

beforeEach(() => {
  tableQueries = {};
  db = stubSupabase({
    tables: {
      tax_profiles: () => trackedQuery('tax_profiles', {
        filing_status: 'single',
        estimated_agi: 200_000,
        carryforward_from_prior: 0,
      }, 'single'),
      v_tax_contributions_enriched: () => trackedQuery(
        'v_tax_contributions_enriched',
        [{
          id: 'contribution-1',
          contribution_date: '2024-06-01',
          recipient_name: 'Example Charity',
          recipient_type: '501c3_public',
          contribution_type: 'cash',
          amount_usd: 1_000,
          calculated_deductible_amount: 1_000,
          is_compliant: true,
        }]
      ),
      tax_carryforwards: () => trackedQuery('tax_carryforwards', []),
      portfolios: () => trackedQuery(
        'portfolios',
        { name: 'Example Foundation' },
        'single'
      ),
    },
    fallbackTable: () => stubQuery({ data: [], error: null }),
  });
  mockSupabasePublic.mockReset();
  mockSupabasePublic.mockResolvedValue(db);
  mockRequirePortfolioAccess.mockReset();
  mockRequirePortfolioAccess.mockResolvedValue({
    ok: true,
    user: { id: 'user-1' },
    role: 'viewer',
    orgId: 'org-1',
    context: {
      db,
      portfolioId: PORTFOLIO_ID,
      orgId: 'org-1',
      role: 'viewer',
      principal: { kind: 'user', userId: 'user-1' },
    },
  });
});

describe('GET tax export access and response contract', () => {
  it('returns the access response before querying tax data', async () => {
    mockRequirePortfolioAccess.mockResolvedValue(denied('Unauthorized', 401));

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockSupabasePublic).not.toHaveBeenCalled();
  });

  it('preserves the JSON export shape and no-store policy for viewers', async () => {
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data).toMatchObject({
      meta: { portfolioName: 'Example Foundation', taxYear: 2024 },
      summary: {
        totalContributions: 1_000,
        totalDeductible: 1_000,
        contributionCount: 1,
      },
      contributions: [{
        recipient: 'Example Charity',
        amount: 1_000,
        deductibleAmount: 1_000,
      }],
      carryforwards: [],
    });
  });

  it('keeps CSV downloads as attachments with no-store', async () => {
    const response = await GET(request('csv'), context());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('tax-summary-2024.csv');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('Portfolio: Example Foundation');
    expect(body).toContain('Example Charity');
  });

  it('returns the existing 400 JSON contract for an unknown format', async () => {
    const response = await GET(request('unknown'), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid format' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('applies the portfolio scope to each base export query', async () => {
    await GET(request(), context());

    for (const table of [
      'tax_profiles',
      'v_tax_contributions_enriched',
      'tax_carryforwards',
    ]) {
      expect(tableQueries[table][0].calls).toContainEqual({
        method: 'eq',
        args: ['portfolio_id', PORTFOLIO_ID],
      });
    }
    expect(tableQueries.portfolios[0].calls).toContainEqual({
      method: 'eq',
      args: ['id', PORTFOLIO_ID],
    });
  });
});
