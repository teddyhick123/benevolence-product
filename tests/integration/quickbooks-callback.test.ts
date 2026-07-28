// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const NONCE = '44444444-4444-4444-8444-444444444444';

const {
  mockRequireUserAccess,
  mockRequireOrgAccess,
  mockCreateOAuthClient,
  mockCreateToken,
  mockEncryptToken,
  mockFrom,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockRequireOrgAccess: vi.fn(),
  mockCreateOAuthClient: vi.fn(),
  mockCreateToken: vi.fn(),
  mockEncryptToken: vi.fn((token: string) => `encrypted:${token}`),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  requireOrgAccess: mockRequireOrgAccess,
}));

vi.mock('@/lib/integrations/quickbooks/client', () => ({
  createOAuthClient: mockCreateOAuthClient,
}));

vi.mock('@/lib/integrations/quickbooks/token-crypto', () => ({
  encryptToken: mockEncryptToken,
}));

import { GET } from '@/app/api/integrations/quickbooks/callback/route';

function state(userId = USER_ID) {
  return Buffer.from(JSON.stringify({ orgId: ORG_ID, userId, nonce: NONCE }))
    .toString('base64url');
}

function request(userId = USER_ID) {
  return new NextRequest(
    `http://localhost/api/integrations/quickbooks/callback?state=${state(userId)}&realmId=realm-1&code=code-1`,
    { headers: { cookie: `qb_oauth_nonce=${NONCE}` } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const db = { from: mockFrom };
  mockRequireUserAccess.mockResolvedValue({
    ok: true,
    context: { user: { id: USER_ID }, db },
  });
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: { orgId: ORG_ID, user: { id: USER_ID }, db },
  });
  mockCreateOAuthClient.mockReturnValue({ createToken: mockCreateToken });
  mockCreateToken.mockResolvedValue({
    getJson: () => ({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      x_refresh_token_expires_in: 7200,
      token_type: 'bearer',
    }),
  });
  mockFrom.mockReturnValue(stubQuery({ data: null, error: null }));
});

describe('QuickBooks OAuth callback', () => {
  it('returns 401 before processing OAuth state when no user session exists', async () => {
    mockRequireUserAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockRequireOrgAccess).not.toHaveBeenCalled();
  });

  it('rejects state initiated by a different signed-in user', async () => {
    const response = await GET(request(OTHER_USER_ID));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid state' });
    expect(mockRequireOrgAccess).not.toHaveBeenCalled();
    expect(mockCreateOAuthClient).not.toHaveBeenCalled();
  });

  it('does not exchange tokens when the state-bound org denies admin access', async () => {
    mockRequireOrgAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(mockCreateOAuthClient).not.toHaveBeenCalled();
  });

  it('stores encrypted tokens only in the state-bound org and clears the nonce', async () => {
    const query = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mockCreateToken).toHaveBeenCalledWith(expect.stringContaining('realmId=realm-1'));
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: ORG_ID,
      realm_id: 'realm-1',
      connected_by: USER_ID,
      access_token: 'encrypted:access-token',
      refresh_token: 'encrypted:refresh-token',
    }), { onConflict: 'org_id' });
    expect(response.headers.get('location')).toContain('connected=1');
    expect(response.headers.get('location')).toContain(`org=${ORG_ID}`);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
