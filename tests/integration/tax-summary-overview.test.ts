// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getSummary } from '@/app/api/portfolio/[id]/tax/summary/route';
import { GET as getOverview } from '@/app/api/portfolio/[id]/tax/overview/route';
import { stubQuery, stubSupabase } from '@/tests/helpers/supabase-mock';

const { mockCreateServerClient, mockSupabasePublic } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockSupabasePublic: vi.fn(),
}));

vi.mock('@/lib/api/server-client', () => ({
  createServerClient: mockCreateServerClient,
  supabasePublic: mockSupabasePublic,
}));

vi.mock('@/lib/api/server-client', () => ({
  createServerClient: mockCreateServerClient,
}));

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PORTFOLIO_ID = '22222222-2222-2222-2222-222222222222';
const USER = { id: 'user-1', email: 'viewer@example.test' };

type SessionState = 'viewer' | 'unauthenticated' | 'cross-portfolio';
let sessionState: SessionState;
let publicDb: ReturnType<typeof stubSupabase>;
let tableQueries: Record<string, ReturnType<typeof stubQuery>[]>;

function sessionClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: sessionState === 'unauthenticated' ? null : USER },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'portfolio_members') {
        const membership = sessionState === 'cross-portfolio'
          ? null
          : { role: 'viewer', portfolios: { org_id: 'org-1' } };
        return stubQuery(
          { data: membership, error: null },
          { maybeSingle: { data: membership, error: null } }
        );
      }
      if (table === 'organization_members') {
        return stubQuery(
          { data: { id: 'membership-1' }, error: null },
          { maybeSingle: { data: { id: 'membership-1' }, error: null } }
        );
      }
      return publicDb.from(table);
    }),
    rpc: (...args: Parameters<typeof publicDb.rpc>) => publicDb.rpc(...args),
  };
}

function trackedQuery(
  table: string,
  data: unknown,
  terminal: 'then' | 'maybeSingle' = 'then'
) {
  const result = { data, error: null };
  const query = terminal === 'maybeSingle'
    ? stubQuery(result, { maybeSingle: result })
    : stubQuery(result);
  tableQueries[table] ??= [];
  tableQueries[table].push(query);
  return query;
}

function request(path: 'summary' | 'overview', portfolioId = PORTFOLIO_ID) {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/${path}?year=2024`
  );
}

function context(portfolioId = PORTFOLIO_ID) {
  return { params: Promise.resolve({ id: portfolioId }) };
}

beforeEach(() => {
  sessionState = 'viewer';
  tableQueries = {};
  mockCreateServerClient.mockReset();
  mockSupabasePublic.mockReset();
  mockCreateServerClient.mockImplementation(async () => sessionClient());

  publicDb = stubSupabase({
    tables: {
      tax_years: () => trackedQuery(
        'tax_years',
        { tax_year: 2024, adjusted_gross_income: 200_000 },
        'maybeSingle'
      ),
      v_portfolio_tax_summary: () => trackedQuery(
        'v_portfolio_tax_summary',
        { total_contributions: 10_000 },
        'maybeSingle'
      ),
      v_tax_contributions_with_limits: () => trackedQuery(
        'v_tax_contributions_with_limits',
        [{ id: 'contribution-1', amount_usd: 10_000 }]
      ),
      v_carryforward_schedule: () => trackedQuery('v_carryforward_schedule', []),
      tax_profiles: () => trackedQuery(
        'tax_profiles',
        { tax_year: 2024, estimated_agi: null },
        'maybeSingle'
      ),
      v_tax_contributions_enriched: () => trackedQuery(
        'v_tax_contributions_enriched',
        [{
          id: 'contribution-1',
          recipient_name: 'Example Charity',
          contribution_type: 'cash',
          amount_usd: 10_000,
          calculated_deductible_amount: 10_000,
          is_compliant: true,
        }]
      ),
      tax_carryforwards: () => trackedQuery('tax_carryforwards', []),
    },
    fallbackRpc: () => ({ data: null, error: null }),
  });
  publicDb.rpc = vi.fn(() => {
    const result = { data: { remaining_capacity: 20_000 }, error: null };
    return stubQuery(result, { maybeSingle: result });
  }) as unknown as typeof publicDb.rpc;
  mockSupabasePublic.mockResolvedValue(publicDb);
});

describe('GET tax summary and overview access boundary', () => {
  it.each([
    ['summary', getSummary],
    ['overview', getOverview],
  ] as const)('%s returns 401 without a valid user session', async (path, handler) => {
    sessionState = 'unauthenticated';

    const response = await handler(request(path), context());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockSupabasePublic).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['summary', getSummary],
    ['overview', getOverview],
  ] as const)('%s returns 403 for a different portfolio', async (path, handler) => {
    sessionState = 'cross-portfolio';

    const response = await handler(
      request(path, OTHER_PORTFOLIO_ID),
      context(OTHER_PORTFOLIO_ID)
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Access denied' });
    expect(mockSupabasePublic).not.toHaveBeenCalled();
  });
});

describe('GET tax summary contract', () => {
  it('preserves its response shape, viewer access, and no-store policy', async () => {
    const response = await getSummary(request('summary'), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toEqual({
      data: {
        taxYear: 2024,
        taxYearData: { tax_year: 2024, adjusted_gross_income: 200_000 },
        summary: { total_contributions: 10_000 },
        contributions: [{ id: 'contribution-1', amount_usd: 10_000 }],
        carryforwards: [],
        capacity: { remaining_capacity: 20_000 },
      },
    });
  });

  it('applies the requested portfolio scope to every table query', async () => {
    await getSummary(request('summary'), context());

    for (const table of [
      'tax_years',
      'v_portfolio_tax_summary',
      'v_tax_contributions_with_limits',
      'v_carryforward_schedule',
    ]) {
      expect(tableQueries[table][0].calls).toContainEqual({
        method: 'eq',
        args: ['portfolio_id', PORTFOLIO_ID],
      });
    }
    expect(publicDb.rpc).toHaveBeenCalledWith('get_donation_capacity', {
      p_portfolio_id: PORTFOLIO_ID,
      p_tax_year: 2024,
    });
  });
});

describe('GET tax overview contract', () => {
  it('preserves its response shape, viewer access, and no-store policy', async () => {
    const response = await getOverview(request('overview'), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data).toMatchObject({
      taxYear: 2024,
      taxProfile: { tax_year: 2024, estimated_agi: null },
      summary: {
        totalContributions: 10_000,
        totalDeductible: 10_000,
        contributionCount: 1,
        missingDocumentation: 0,
      },
      contributionsByRecipient: [
        { name: 'Example Charity', total: 10_000, count: 1 },
      ],
      contributionsByType: { cash: 10_000 },
    });
  });

  it('applies the requested portfolio scope to every table query', async () => {
    await getOverview(request('overview'), context());

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
  });
});
