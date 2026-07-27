// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requireAppAdmin,
  requireCpaToken,
  requireOrgAccess,
  requirePortfolioAccess,
} from '@/lib/api/access';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateServerClient, mockResolveCpaToken } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockResolveCpaToken: vi.fn(),
}));

vi.mock('@/lib/api/server-client', () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock('@/lib/api/repositories/cpa-share', () => ({
  resolveCpaToken: mockResolveCpaToken,
}));

const USER = { id: 'user-1', email: 'member@example.test' };

type ClientOptions = {
  user?: typeof USER | null;
  authError?: { message: string } | null;
  rpc?: Record<string, { data: unknown; error: { message: string } | null }>;
  portfolioMembership?: { data: unknown; error: { message: string } | null };
  orgMembership?: { data: unknown; error: { message: string } | null };
};

function client(options: ClientOptions = {}) {
  const rpc = vi.fn(async (name: string) =>
    options.rpc?.[name] ?? { data: null, error: null }
  );
  const from = vi.fn((table: string) => {
    if (table === 'portfolio_members') {
      const result = options.portfolioMembership ?? {
        data: { role: 'member', portfolios: { org_id: 'org-1' } },
        error: null,
      };
      return stubQuery(result, { maybeSingle: result });
    }
    if (table === 'organization_members') {
      const result = options.orgMembership ?? { data: { id: 'membership-1' }, error: null };
      return stubQuery(result, { maybeSingle: result });
    }
    throw new Error(`unexpected table ${table}`);
  });
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? USER : options.user },
        error: options.authError ?? null,
      })),
    },
    rpc,
    from,
  };
}

beforeEach(() => {
  mockCreateServerClient.mockReset();
  mockResolveCpaToken.mockReset();
});

describe('requireOrgAccess', () => {
  it('returns a typed user context for a sufficient role', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      rpc: { user_org_role: { data: 'admin', error: null } },
    }));

    const result = await requireOrgAccess('org-1', 'member');
    expect(result).toMatchObject({
      ok: true,
      context: {
        orgId: 'org-1',
        role: 'admin',
        principal: { kind: 'user', userId: USER.id },
      },
    });
  });

  it('returns 401 when no valid session user exists', async () => {
    const db = client({ user: null });
    mockCreateServerClient.mockResolvedValue(db);
    const result = await requireOrgAccess('org-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.reason).toBe('unauthenticated');
    expect(result.response.status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('returns 403 when the role is below the requested minimum', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      rpc: { user_org_role: { data: 'viewer', error: null } },
    }));
    const result = await requireOrgAccess('org-1', 'member');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.reason).toBe('forbidden');
    expect(result.response.status).toBe(403);
  });

  it('keeps an RPC failure distinct from authorization denial', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      rpc: { user_org_role: { data: null, error: { message: 'database unavailable' } } },
    }));
    const result = await requireOrgAccess('org-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.reason).toBe('infrastructure');
    expect(result.response.status).toBe(500);
  });
});

describe('requirePortfolioAccess', () => {
  it('returns portfolio and organization scope after both memberships pass', async () => {
    mockCreateServerClient.mockResolvedValue(client());
    const result = await requirePortfolioAccess('portfolio-1', 'member');
    expect(result).toMatchObject({
      ok: true,
      context: {
        portfolioId: 'portfolio-1',
        orgId: 'org-1',
        role: 'member',
        principal: { kind: 'user', userId: USER.id },
      },
    });
  });

  it('denies a role below the requested portfolio threshold', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      portfolioMembership: {
        data: { role: 'viewer', portfolios: { org_id: 'org-1' } },
        error: null,
      },
    }));
    const result = await requirePortfolioAccess('portfolio-1', 'member');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.response.status).toBe(403);
  });

  it('denies access when active accepted org membership is absent', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      orgMembership: { data: null, error: null },
    }));
    const result = await requirePortfolioAccess('portfolio-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.reason).toBe('forbidden');
    expect(result.response.status).toBe(403);
  });
});

describe('requireAppAdmin', () => {
  it('returns an app-admin user context only when the canonical RPC passes', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      rpc: { is_app_admin: { data: true, error: null } },
    }));
    await expect(requireAppAdmin()).resolves.toMatchObject({
      ok: true,
      context: { isAppAdmin: true, principal: { kind: 'user', userId: USER.id } },
    });
  });

  it('returns 403 for an authenticated non-admin', async () => {
    mockCreateServerClient.mockResolvedValue(client({
      rpc: { is_app_admin: { data: false, error: null } },
    }));
    const result = await requireAppAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.response.status).toBe(403);
  });
});

describe('requireCpaToken', () => {
  it('returns the CPA principal scope and scoped repository', async () => {
    const repository = { getPortalPayload: vi.fn(), createDownload: vi.fn() };
    mockResolveCpaToken.mockResolvedValue({
      ok: true,
      context: {
        principal: { kind: 'cpa_share', shareLinkId: 'share-1' },
        orgId: 'org-1',
        portfolioId: 'portfolio-1',
        taxYears: [2024, 2025],
        permissions: { view_tax_summary: true },
      },
      repository,
    });

    await expect(requireCpaToken('raw-token')).resolves.toMatchObject({
      ok: true,
      context: {
        principal: { kind: 'cpa_share', shareLinkId: 'share-1' },
        orgId: 'org-1',
        portfolioId: 'portfolio-1',
        taxYears: [2024, 2025],
        repository,
      },
    });
  });

  it.each([
    [404, 'not_found'],
    [410, 'gone'],
    [500, 'infrastructure'],
  ])('maps a %i token failure to a typed denial', async (status, reason) => {
    mockResolveCpaToken.mockResolvedValue({
      ok: false,
      status,
      error: 'Token failure',
    });

    const result = await requireCpaToken('raw-token');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected access denial');
    expect(result.reason).toBe(reason);
    expect(result.response.status).toBe(status);
    await expect(result.response.json()).resolves.toEqual({ error: 'Token failure' });
  });
});
