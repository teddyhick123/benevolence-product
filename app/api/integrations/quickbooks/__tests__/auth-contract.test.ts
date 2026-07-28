import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('QB OAuth param contract', () => {
  it('IntegrationsTab connect URL uses org_id not orgId', () => {
    const src = readFileSync('components/settings/IntegrationsTab.tsx', 'utf8');
    expect(src).not.toMatch(/[?&]orgId=/);
  });
});

describe('QB route role checks', () => {
  it('connection management uses the shared admin guard', () => {
    for (const file of [
      'app/api/integrations/quickbooks/connect/route.ts',
      'app/api/integrations/quickbooks/disconnect/route.ts',
      'app/api/integrations/quickbooks/sync-log/route.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain("requireOrgAccess(orgId, 'admin')");
      expect(src).not.toContain('createServerClient');
    }
  });

  it('connection status and account reads use the shared viewer guard', () => {
    for (const file of [
      'app/api/integrations/quickbooks/status/route.ts',
      'app/api/integrations/quickbooks/accounts/route.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain("requireOrgAccess(orgId, 'viewer')");
      expect(src).not.toContain('createServerClient');
    }
  });

  it('account sync uses the shared admin guard', () => {
    const src = readFileSync(
      'app/api/integrations/quickbooks/sync/accounts/route.ts',
      'utf8'
    );
    expect(src).toContain("requireOrgAccess(orgId, 'admin')");
    expect(src).not.toContain('createServerClient');
  });
});
