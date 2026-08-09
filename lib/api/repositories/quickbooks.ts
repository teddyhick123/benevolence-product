import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import {
  findAccountsAsync,
  getAuthenticatedQBClientForStore,
  type QBConnection,
} from '@/lib/integrations/quickbooks/client';
import {
  claimQBExportAttempt,
  type QBExportAttemptInput,
} from '@/lib/integrations/quickbooks/export-attempts';

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
  const connectionStore = {
    async getConnection(): Promise<QBConnection | null> {
      const { data, error } = await db
        .from('quickbooks_connections')
        .select('*')
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (error || !data) return null;
      return data as QBConnection;
    },

    async updateTokens(input: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      refreshExpiresAt: string;
    }) {
      const { error } = await db
        .from('quickbooks_connections')
        .update({
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          expires_at: input.expiresAt,
          refresh_expires_at: input.refreshExpiresAt,
        })
        .eq('org_id', scope.orgId);
      if (error) throw error;
    },
  };

  return {
    async getConnectionStatus() {
      const { data, error } = await db
        .from('quickbooks_connections')
        .select('id, expires_at, refresh_expires_at')
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (error) throw error;

      const now = new Date();
      return {
        connected: !!data,
        tokenExpired: data?.expires_at ? new Date(data.expires_at) <= now : false,
        needsReconnect: data?.refresh_expires_at
          ? new Date(data.refresh_expires_at) <= now
          : false,
      };
    },

    async getAuthenticatedClient() {
      return getAuthenticatedQBClientForStore(connectionStore);
    },

    async syncAccounts(): Promise<QuickBooksAccountSyncResult> {
      const qbResult = await getAuthenticatedQBClientForStore(connectionStore);
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

    async claimExportAttempt(input: Omit<QBExportAttemptInput, 'orgId'>) {
      return claimQBExportAttempt(db, { ...input, orgId: scope.orgId });
    },

    async completeExportAttempt(attemptId: string, qbJournalEntryId: string) {
      const { error } = await db
        .from('qb_export_attempts')
        .update({
          status: 'succeeded',
          qb_journal_entry_id: qbJournalEntryId,
          error_msg: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attemptId)
        .eq('org_id', scope.orgId);
      if (error) throw error;
    },

    async failExportAttempt(attemptId: string, errorMsg: string) {
      const { error } = await db
        .from('qb_export_attempts')
        .update({
          status: 'failed',
          error_msg: errorMsg,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attemptId)
        .eq('org_id', scope.orgId);
      if (error) throw error;
    },

    async reconcileContributionExport(sourceId: string, qbJournalEntryId: string) {
      return db
        .from('tax_contributions')
        .update({
          qb_exported_at: new Date().toISOString(),
          qb_journal_entry_id: qbJournalEntryId,
        })
        .eq('id', sourceId)
        .eq('org_id', scope.orgId);
    },

    async reconcileGrantExport(sourceId: string, qbJournalEntryId: string) {
      return db
        .from('grants')
        .update({
          qb_exported_at: new Date().toISOString(),
          qb_journal_entry_id: qbJournalEntryId,
        })
        .eq('id', sourceId)
        .eq('org_id', scope.orgId);
    },

    async recordExportLog(input: {
      eventType: 'contributions_export' | 'grants_export';
      status: 'success' | 'error';
      recordCount: number | null;
      errorMsg?: string;
    }) {
      const { error } = await db.from('qb_sync_log').insert({
        org_id: scope.orgId,
        event_type: input.eventType,
        status: input.status,
        record_count: input.recordCount,
        error_msg: input.errorMsg ?? null,
      });
      if (error) throw error;
    },
  };
}
