// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const COLLECTION = readFileSync(join(ROOT, 'app/api/org/[orgId]/export/route.ts'), 'utf8');
const ITEM = readFileSync(join(ROOT, 'app/api/org/[orgId]/export/[runId]/route.ts'), 'utf8');

describe('export routes', () => {
  it('guards both routes as org admin', () => {
    expect(COLLECTION).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(ITEM).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  // An archive holds tax documents and personal data, so who produced one is
  // worth keeping after the archive itself is gone.
  it('writes an audit row before enqueuing', () => {
    expect(COLLECTION).toMatch(/org_audit_log/);
    expect(COLLECTION).toMatch(/org\.data_exported/);
  });

  it('returns 202 rather than waiting for the export', () => {
    expect(COLLECTION).toMatch(/status:\s*202/);
  });

  it('reports a conflict rather than a server error for a second live run', () => {
    expect(COLLECTION).toMatch(/409/);
  });

  // Never getPublicUrl: the bucket is private and the archive is the most
  // concentrated copy of a client's data that exists.
  it('hands back a one-hour signed URL and never a public one', () => {
    expect(ITEM).toMatch(/createSignedUrl\([^,]+,\s*3600\)/);
    expect(ITEM).not.toMatch(/getPublicUrl/);
  });

  it('offers no URL for a run that has not succeeded', () => {
    expect(ITEM).toMatch(/status !== 'succeeded'/);
  });

  // The guard proves admin access to orgId, not to this run id.
  it('scopes a run lookup to the organization in the path', () => {
    expect(ITEM).toMatch(/run\.org_id !== orgId/);
  });
});
