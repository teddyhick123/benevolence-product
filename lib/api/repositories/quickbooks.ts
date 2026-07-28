import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import {
  findAccountsAsync,
  getAuthenticatedQBClientByOrg,
} from '@/lib/integrations/quickbooks/client';

type QuickBooksScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

export type QuickBooksAccountSyncResult =
  | { status: 'success'; synced: number }
  | { status: 'not_connected' }
  | { status: 'provider_error' }
  | { status: 'storage_error' };

/** Elevated QuickBooks operations constrained to one authorized organization. */
export function createQuickBooksRepository(scope: QuickBooksScope) {
  const db = createElevatedClient();

  return {
    async syncAccounts(): Promise<QuickBooksAccountSyncResult> {
      const qbResult = await getAuthenticatedQBClientByOrg(scope.orgId);
      if (!qbResult) return { status: 'not_connected' };

      let accounts;
      try {
        accounts = await findAccountsAsync(qbResult.client);
      } catch {
        return { status: 'provider_error' };
      }

      const now = new Date().toISOString();
      const rows = accounts.map(account => ({
        org_id: scope.orgId,
        connection_id: qbResult.connection.id,
        qb_id: account.Id,
        qb_name: account.Name,
        qb_type: account.AccountType,
        qb_subtype: account.AccountSubType ?? null,
        current_balance: account.CurrentBalance ?? 0,
        synced_at: now,
      }));
      const { error: upsertError } = await db
        .from('qb_accounts')
        .upsert(rows, { onConflict: 'org_id,qb_id' });

      if (upsertError) {
        await db.from('qb_sync_log').insert({
          org_id: scope.orgId,
          event_type: 'accounts_sync',
          status: 'error',
          error_msg: upsertError.message,
        });
        return { status: 'storage_error' };
      }

      await db
        .from('quickbooks_connections')
        .update({ last_sync_at: now })
        .eq('id', qbResult.connection.id)
        .eq('org_id', scope.orgId);
      await db.from('qb_sync_log').insert({
        org_id: scope.orgId,
        event_type: 'accounts_sync',
        status: 'success',
        record_count: rows.length,
      });

      return { status: 'success', synced: rows.length };
    },
  };
}
