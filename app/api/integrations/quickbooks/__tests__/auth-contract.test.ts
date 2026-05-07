import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('QB OAuth param contract', () => {
  it('IntegrationsTab connect URL uses org_id not orgId', () => {
    const src = readFileSync('components/settings/IntegrationsTab.tsx', 'utf8');
    expect(src).not.toMatch(/[?&]orgId=/);
  });
});

describe('QB route role checks', () => {
  const routeFiles = [
    'app/api/integrations/quickbooks/connect/route.ts',
    'app/api/integrations/quickbooks/disconnect/route.ts',
    'app/api/integrations/quickbooks/sync/accounts/route.ts',
  ];

  for (const file of routeFiles) {
    it(`${file} checks member_role`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('member_role');
    });
  }
});
