// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickBooksRepository } from '@/lib/api/repositories/quickbooks';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockGetAuthenticatedQBClientForStore,
  mockFindAccountsAsync,
  mockClaimQBExportAttempt,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockGetAuthenticatedQBClientForStore: vi.fn(),
  mockFindAccountsAsync: vi.fn(),
  mockClaimQBExportAttempt: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/integrations/quickbooks/client', () => ({
  getAuthenticatedQBClientForStore: mockGetAuthenticatedQBClientForStore,
  findAccountsAsync: mockFindAccountsAsync,
}));

vi.mock('@/lib/integrations/quickbooks/export-attempts', () => ({
  claimQBExportAttempt: mockClaimQBExportAttempt,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
  mockGetAuthenticatedQBClientForStore.mockResolvedValue({
    client: { kind: 'quickbooks-client' },
    connection: { id: 'connection-1', org_id: 'org-1' },
  });
  mockFindAccountsAsync.mockResolvedValue([
    {
      Id: 'qb-account-1',
      Name: 'Grant expense',
      AccountType: 'Expense',
      CurrentBalance: 125,
    },
  ]);
  mockClaimQBExportAttempt.mockResolvedValue({ status: 'claimed', attemptId: 'attempt-1' });
});

describe('createQuickBooksRepository', () => {
  it('reads connection status only within the authorized organization', async () => {
    const connectionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'connection-1',
            expires_at: '2000-01-01T00:00:00.000Z',
            refresh_expires_at: '2999-01-01T00:00:00.000Z',
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(connectionQuery);

    const status = await createQuickBooksRepository({
      orgId: 'org-1',
      actorId: 'user-1',
    }).getConnectionStatus();

    expect(connectionQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(status).toEqual({ connected: true, tokenExpired: true, needsReconnect: false });
  });

  it('forces the authorized org and required connection into account rows', async () => {
    const accountQuery = stubQuery({ data: null, error: null });
    const connectionQuery = stubQuery({ data: null, error: null });
    const logQuery = stubQuery({ data: null, error: null });
    mockFrom.mockImplementation(table => {
      if (table === 'qb_accounts') return accountQuery;
      if (table === 'quickbooks_connections') return connectionQuery;
      return logQuery;
    });

    const result = await createQuickBooksRepository({
      orgId: 'org-1',
      actorId: 'user-1',
    }).syncAccounts();

    expect(mockGetAuthenticatedQBClientForStore).toHaveBeenCalledWith(expect.objectContaining({
      getConnection: expect.any(Function),
      updateTokens: expect.any(Function),
    }));
    expect(accountQuery.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: 'org-1',
        connection_id: 'connection-1',
        qb_id: 'qb-account-1',
      }),
    ], { onConflict: 'org_id,qb_id' });
    expect(connectionQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'connection-1'] });
    expect(connectionQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(logQuery.insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      event_type: 'accounts_sync',
      status: 'success',
      record_count: 1,
    });
    expect(result).toEqual({ status: 'success', synced: 1 });
  });

  it('writes storage failures to the service-only sync log in the org scope', async () => {
    const accountQuery = stubQuery({ data: null, error: { message: 'insert denied' } });
    const logQuery = stubQuery({ data: null, error: null });
    mockFrom.mockImplementation(table => table === 'qb_accounts' ? accountQuery : logQuery);

    const result = await createQuickBooksRepository({
      orgId: 'org-1',
      actorId: 'user-1',
    }).syncAccounts();

    expect(logQuery.insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      event_type: 'accounts_sync',
      status: 'error',
      error_msg: 'insert denied',
    });
    expect(result).toEqual({ status: 'storage_error' });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createQuickBooksRepository({ orgId: 'org-1', actorId: 'user-1' });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });

  it('supplies an org-scoped connection store to the QuickBooks client factory', async () => {
    const connectionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'connection-1', org_id: 'org-1', realm_id: 'realm-1' },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(connectionQuery);
    mockGetAuthenticatedQBClientForStore.mockImplementation(async store => {
      await store.getConnection();
      return null;
    });

    await createQuickBooksRepository({ orgId: 'org-1', actorId: 'user-1' })
      .getAuthenticatedClient();

    expect(connectionQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('forces refreshed token persistence into the repository org scope', async () => {
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(updateQuery);
    mockGetAuthenticatedQBClientForStore.mockImplementation(async store => {
      await store.updateTokens({
        accessToken: 'encrypted-access',
        refreshToken: 'encrypted-refresh',
        expiresAt: '2026-07-28T14:00:00.000Z',
        refreshExpiresAt: '2026-11-06T14:00:00.000Z',
      });
      return null;
    });

    await createQuickBooksRepository({ orgId: 'org-1', actorId: 'user-1' })
      .getAuthenticatedClient();

    expect(updateQuery.update).toHaveBeenCalledWith({
      access_token: 'encrypted-access',
      refresh_token: 'encrypted-refresh',
      expires_at: '2026-07-28T14:00:00.000Z',
      refresh_expires_at: '2026-11-06T14:00:00.000Z',
    });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('forces export claims into the authorized organization scope', async () => {
    const repository = createQuickBooksRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.claimExportAttempt({
      exportType: 'grant',
      sourceTable: 'grants',
      sourceId: 'grant-1',
      docNumber: 'GRANT-1',
      expectedAmount: 100,
      debitAccountId: 'expense-1',
      creditAccountId: 'bank-1',
    });

    expect(mockClaimQBExportAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      expect.objectContaining({ orgId: 'org-1', sourceId: 'grant-1' })
    );
  });

  it('scopes attempt completion and source reconciliation by org ID', async () => {
    const attemptQuery = stubQuery({ data: null, error: null });
    const grantQuery = stubQuery({ data: null, error: null });
    mockFrom.mockImplementation(table => table === 'qb_export_attempts' ? attemptQuery : grantQuery);
    const repository = createQuickBooksRepository({ orgId: 'org-1', actorId: 'user-1' });

    await repository.completeExportAttempt('attempt-1', 'journal-1');
    await repository.reconcileGrantExport('grant-1', 'journal-1');

    expect(attemptQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'attempt-1'] });
    expect(attemptQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(grantQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'grant-1'] });
    expect(grantQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });
});
