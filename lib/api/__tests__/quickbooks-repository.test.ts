// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickBooksRepository } from '@/lib/api/repositories/quickbooks';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockGetAuthenticatedQBClientByOrg,
  mockFindAccountsAsync,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockGetAuthenticatedQBClientByOrg: vi.fn(),
  mockFindAccountsAsync: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/integrations/quickbooks/client', () => ({
  getAuthenticatedQBClientByOrg: mockGetAuthenticatedQBClientByOrg,
  findAccountsAsync: mockFindAccountsAsync,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
  mockGetAuthenticatedQBClientByOrg.mockResolvedValue({
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
});

describe('createQuickBooksRepository', () => {
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

    expect(mockGetAuthenticatedQBClientByOrg).toHaveBeenCalledWith('org-1');
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
});
