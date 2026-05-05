// lib/integrations/quickbooks/client.ts
// Authenticated QuickBooks Online client factory with automatic token refresh.

import { createAdminClient } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Minimal type declarations for the third-party packages
// ---------------------------------------------------------------------------

interface OAuthClientOptions {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  redirectUri: string;
}

interface OAuthToken {
  token_type?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface OAuthAuthResponse {
  getJson(): OAuthToken;
}

interface OAuthClientInstance {
  authorizeUri(opts: { scope: string[]; state: string }): string;
  createToken(redirectUri: string): Promise<OAuthAuthResponse>;
  refresh(): Promise<OAuthAuthResponse>;
  revoke(params: { token: string }): Promise<void>;
  setToken(token: OAuthToken): void;
  getToken(): OAuthToken;
}

interface OAuthClientStatic {
  new (opts: OAuthClientOptions): OAuthClientInstance;
  scopes: {
    Accounting: string;
    OpenId: string;
    Profile: string;
    Email: string;
    Phone: string;
    Address: string;
  };
}

const OAuthClient = require('intuit-oauth') as OAuthClientStatic;

// ---------------------------------------------------------------------------
// node-quickbooks types (subset we actually use)
// ---------------------------------------------------------------------------

type QBCallback<T> = (err: Error | null, result: T) => void;

interface QBAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  CurrentBalance?: number;
}

interface QBAccountQueryResponse {
  QueryResponse?: { Account?: QBAccount[] };
}

interface QBJournalEntry {
  Line: QBJournalLine[];
  TxnDate?: string;
  PrivateNote?: string;
  DocNumber?: string;
}

interface QBJournalLine {
  Id?: string;
  Description?: string;
  Amount: number;
  DetailType: 'JournalEntryLineDetail';
  JournalEntryLineDetail: {
    PostingType: 'Debit' | 'Credit';
    AccountRef: { value: string; name?: string };
  };
}

interface QBClientInstance {
  findAccounts(
    criteria: Array<{ field: string; value: boolean | string; operator?: string }>,
    callback: QBCallback<QBAccountQueryResponse>
  ): void;
  createJournalEntry(
    entry: QBJournalEntry,
    callback: QBCallback<unknown>
  ): void;
}

const QuickBooks = require('node-quickbooks') as new (
  clientId: string,
  clientSecret: string,
  accessToken: string,
  oauthTokenSecret: boolean,
  realmId: string,
  useSandbox: boolean,
  debug: boolean,
  minorversion: null | number,
  oauthversion: string,
  refreshToken: string
) => QBClientInstance;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface QBConnection {
  id: string;
  org_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string | null;
  created_at: string;
  last_sync_at: string | null;
}

export { OAuthClient };
export type { QBAccount, QBAccountQueryResponse, QBJournalEntry, QBJournalLine };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createOAuthClient(): OAuthClientInstance {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID!,
    clientSecret: process.env.QB_CLIENT_SECRET!,
    environment: (process.env.QB_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
    redirectUri: process.env.QB_REDIRECT_URI!,
  });
}

/** @deprecated QB connections are org-scoped — use getQBConnectionByOrg instead */
export async function getQBConnection(_portfolioId: string): Promise<QBConnection | null> {
  console.warn('[QB] getQBConnection(portfolioId) is deprecated; QB is org-scoped. Use getQBConnectionByOrg(orgId).');
  return null;
}

export async function getQBConnectionByOrg(orgId: string): Promise<QBConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('quickbooks_connections')
    .select('*')
    .eq('org_id', orgId)
    .single();
  if (error || !data) return null;
  return data as QBConnection;
}

/**
 * @deprecated QB connections are org-scoped since the schema migration.
 * This function always returns null. Use getAuthenticatedQBClientByOrg(orgId) instead.
 */
export async function getAuthenticatedQBClient(
  _portfolioId: string
): Promise<{ client: QBClientInstance; connection: QBConnection } | null> {
  console.warn('[QB] getAuthenticatedQBClient(portfolioId) is deprecated — QB is org-scoped. Use getAuthenticatedQBClientByOrg(orgId).');
  return null;
}

/**
 * Returns an authenticated node-quickbooks client for the given org.
 * Auto-refreshes the OAuth token if it will expire within 30 days and
 * persists updated tokens back to the database.
 */
export async function getAuthenticatedQBClientByOrg(
  orgId: string
): Promise<{ client: QBClientInstance; connection: QBConnection } | null> {
  const supabase = createAdminClient();
  let connection = await getQBConnectionByOrg(orgId);
  if (!connection) return null;

  // Check if refresh token itself has expired (101-day QuickBooks limit)
  if (connection.refresh_expires_at && new Date(connection.refresh_expires_at) <= new Date()) {
    console.warn('[QB] Refresh token expired for org', orgId, '— user must reconnect');
    return null;
  }

  const tokenExpiry = new Date(connection.expires_at);
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (tokenExpiry <= thirtyDaysFromNow) {
    try {
      const oauthClient = createOAuthClient();
      oauthClient.setToken({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token,
        expires_in: Math.max(
          0,
          Math.floor((tokenExpiry.getTime() - Date.now()) / 1000)
        ),
      });

      const authResponse = await oauthClient.refresh();
      const newTokens = authResponse.getJson();
      const newExpiry = new Date(
        Date.now() + (newTokens.expires_in ?? 3600) * 1000
      );
      // QB refresh tokens have a 101-day lifetime; update expiry on each successful refresh
      const newRefreshExpiry = new Date(Date.now() + 101 * 24 * 60 * 60 * 1000);

      const { data: updated } = await supabase
        .from('quickbooks_connections')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: newExpiry.toISOString(),
          refresh_expires_at: newRefreshExpiry.toISOString(),
        })
        .eq('org_id', orgId)
        .select()
        .single();

      if (updated) connection = updated as QBConnection;
    } catch (err) {
      console.error('[QB] Token refresh failed:', err);
      return null;
    }
  }

  const useSandbox = process.env.QB_ENVIRONMENT !== 'production';

  const client = new QuickBooks(
    process.env.QB_CLIENT_ID!,
    process.env.QB_CLIENT_SECRET!,
    connection.access_token,
    false,
    connection.realm_id,
    useSandbox,
    false,
    null,
    '2.0',
    connection.refresh_token
  );

  return { client, connection };
}

/**
 * Promisified wrapper for node-quickbooks findAccounts.
 */
export function findAccountsAsync(
  client: QBClientInstance
): Promise<QBAccount[]> {
  return new Promise((resolve, reject) => {
    client.findAccounts(
      [{ field: 'FetchAll', value: true, operator: '=' }],
      (err, result) => {
        if (err) return reject(err);
        resolve(result?.QueryResponse?.Account ?? []);
      }
    );
  });
}

/**
 * Promisified wrapper for node-quickbooks createJournalEntry.
 */
export function createJournalEntryAsync(
  client: QBClientInstance,
  entry: QBJournalEntry
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    client.createJournalEntry(entry, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}
