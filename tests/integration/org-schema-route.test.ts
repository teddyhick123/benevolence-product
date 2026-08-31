// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app/api/org/[orgId]/schema/route.ts'),
  'utf8',
);

describe('schema transparency route', () => {
  it('guards org admin access', () => {
    expect(ROUTE).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  // The counts are only safe because they are org-scoped: the schema itself is
  // shared across organizations.
  it('scopes table counts to the organization', () => {
    expect(ROUTE).toMatch(/org_table_row_counts/);
    expect(ROUTE).toMatch(/p_org_id:\s*orgId/);
  });

  it('reports migration state through the shared comparison', () => {
    expect(ROUTE).toMatch(/compareLedger/);
  });

  it('reports adopted and verified as distinct states', () => {
    expect(ROUTE).toMatch(/adopted/);
    expect(ROUTE).toMatch(/verified/);
  });
});
