import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('quickbooks_connections column contract', () => {
  const statusSrc = readFileSync(
    'app/api/integrations/quickbooks/status/route.ts',
    'utf8'
  );
  const callbackSrc = readFileSync(
    'app/api/integrations/quickbooks/callback/route.ts',
    'utf8'
  );

  it('status route selects expires_at not token_expiry', () => {
    expect(statusSrc).toContain('expires_at');
    expect(statusSrc).not.toContain(".select('realm_id, token_expiry");
  });

  it('status route uses created_at not connected_at in select', () => {
    expect(statusSrc).toContain("'realm_id, created_at, last_sync_at, expires_at");
    expect(statusSrc).not.toContain("'realm_id, connected_at");
  });

  it('callback route writes canonical connection columns', () => {
    expect(callbackSrc).toContain('expires_at');
    expect(callbackSrc).toContain('refresh_expires_at');
    expect(callbackSrc).toContain('connected_by');
    expect(callbackSrc).not.toContain('token_expiry:');
    expect(callbackSrc).not.toMatch(/^\s*connected_at:/m);
  });
});

describe('qb_accounts column contract', () => {
  const accountsSrc = readFileSync(
    'app/api/integrations/quickbooks/accounts/route.ts',
    'utf8'
  );
  const syncSrc = readFileSync(
    'app/api/integrations/quickbooks/sync/accounts/route.ts',
    'utf8'
  );

  it('accounts route uses qb_id not qb_account_id', () => {
    expect(accountsSrc).not.toContain('qb_account_id');
    expect(accountsSrc).toContain('qb_id');
  });

  it('accounts route uses qb_name not name in select', () => {
    expect(accountsSrc).toContain('qb_name');
  });

  it('sync route uses qb_id not qb_account_id', () => {
    expect(syncSrc).not.toContain('qb_account_id');
    expect(syncSrc).toContain('qb_id');
  });

  it('sync route conflict key uses org_id,qb_id', () => {
    expect(syncSrc).toContain("'org_id,qb_id'");
    expect(syncSrc).not.toContain("'org_id,qb_account_id'");
  });
});
