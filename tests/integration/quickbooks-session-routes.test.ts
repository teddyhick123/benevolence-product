// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const {
  mockRequireOrgAccess,
  mockFrom,
  mockAuthorizeUri,
  mockCreateOAuthClient,
  mockCreateQuickBooksRepository,
  mockSyncAccounts,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockAuthorizeUri: vi.fn(),
  mockCreateOAuthClient: vi.fn(),
  mockCreateQuickBooksRepository: vi.fn(),
  mockSyncAccounts: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
}));

vi.mock('@/lib/integrations/quickbooks/client', () => ({
  OAuthClient: { scopes: { Accounting: 'accounting', OpenId: 'openid' } },
  createOAuthClient: mockCreateOAuthClient,
}));

vi.mock('@/lib/api/repositories/quickbooks', () => ({
  createQuickBooksRepository: mockCreateQuickBooksRepository,
}));

import { GET as getAccounts } from '@/app/api/integrations/quickbooks/accounts/route';
import { GET as connect } from '@/app/api/integrations/quickbooks/connect/route';
import { POST as disconnect } from '@/app/api/integrations/quickbooks/disconnect/route';
import { GET as getStatus } from '@/app/api/integrations/quickbooks/status/route';
import { GET as getSyncLog } from '@/app/api/integrations/quickbooks/sync-log/route';
import { POST as syncAccounts } from '@/app/api/integrations/quickbooks/sync/accounts/route';

function get(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function denied(status: number) {
  return {
    ok: false,
    response: NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status, headers: { 'Cache-Control': 'no-store' } }
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: {
      orgId: ORG_ID,
      user: { id: 'user-1' },
      db: { from: mockFrom },
    },
  });
  mockAuthorizeUri.mockReturnValue('https://appcenter.intuit.test/connect');
  mockCreateOAuthClient.mockReturnValue({
    authorizeUri: mockAuthorizeUri,
    setToken: vi.fn(),
    revoke: vi.fn(),
  });
  mockCreateQuickBooksRepository.mockReturnValue({ syncAccounts: mockSyncAccounts });
  mockSyncAccounts.mockResolvedValue({ status: 'success', synced: 3 });
});

describe('QuickBooks session routes', () => {
  it('does not query accounts after cross-org access is denied', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied(403));

    const response = await getAccounts(
      get(`/api/integrations/quickbooks/accounts?org_id=${ORG_ID}`)
    );

    expect(response.status).toBe(403);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'viewer');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists accounts through the session client with an explicit org filter', async () => {
    const query = stubQuery({
      data: [{ id: 'account-1', qb_id: '7', qb_name: 'Grants expense' }],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const response = await getAccounts(
      get(`/api/integrations/quickbooks/accounts?org_id=${ORG_ID}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(await response.json()).toEqual({
      accounts: [{ id: 'account-1', qb_id: '7', qb_name: 'Grants expense' }],
    });
  });

  it('returns canonical connection status fields through viewer access', async () => {
    const query = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            realm_id: 'realm-1',
            created_at: '2026-07-01T00:00:00.000Z',
            last_sync_at: null,
            expires_at: '2099-07-01T00:00:00.000Z',
            refresh_expires_at: '2099-10-01T00:00:00.000Z',
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(query);

    const response = await getStatus(
      get(`/api/integrations/quickbooks/status?org_id=${ORG_ID}`)
    );
    const body = await response.json();

    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'viewer');
    expect(body).toMatchObject({
      connected: true,
      realm_id: 'realm-1',
      token_expired: false,
      refresh_token_expired: false,
      needs_reconnect: false,
    });
  });

  it('requires admin access and clamps the sync-log limit', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const response = await getSyncLog(
      get(`/api/integrations/quickbooks/sync-log?org_id=${ORG_ID}&limit=1000`)
    );

    expect(response.status).toBe(200);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it('binds OAuth state to the authorized org, user, and nonce', async () => {
    const response = await connect(
      get(`/api/integrations/quickbooks/connect?org_id=${ORG_ID}`)
    );

    expect(response.status).toBe(307);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    const state = mockAuthorizeUri.mock.calls[0][0].state as string;
    expect(JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))).toMatchObject({
      orgId: ORG_ID,
      userId: 'user-1',
      nonce: expect.any(String),
    });
    expect(response.headers.get('Set-Cookie')).toContain('qb_oauth_nonce=');
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  });

  it('disconnects only after admin access and scopes both deletes to the org', async () => {
    const connectionQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const connectionDelete = stubQuery({ data: null, error: null });
    const accountsDelete = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(connectionQuery)
      .mockReturnValueOnce(connectionDelete)
      .mockReturnValueOnce(accountsDelete);
    const request = new NextRequest(
      'http://localhost/api/integrations/quickbooks/disconnect',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: ORG_ID }),
      }
    );

    const response = await disconnect(request);

    expect(response.status).toBe(200);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(connectionDelete.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(accountsDelete.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(await response.json()).toEqual({ ok: true });
  });

  it('syncs accounts through an operation-specific org repository', async () => {
    const request = new NextRequest(
      'http://localhost/api/integrations/quickbooks/sync/accounts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: ORG_ID }),
      }
    );

    const response = await syncAccounts(request);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(mockCreateQuickBooksRepository).toHaveBeenCalledWith({
      orgId: ORG_ID,
      actorId: 'user-1',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, synced: 3 });
  });

  it('does not construct the sync repository when cross-org access is denied', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied(403));
    const request = new NextRequest(
      'http://localhost/api/integrations/quickbooks/sync/accounts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: ORG_ID }),
      }
    );

    const response = await syncAccounts(request);

    expect(response.status).toBe(403);
    expect(mockCreateQuickBooksRepository).not.toHaveBeenCalled();
  });
});
