// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ORG = readFileSync(join(ROOT, 'app/api/org/[orgId]/ai-settings/spend-cap/route.ts'), 'utf8');
const ADMIN = readFileSync(join(ROOT, 'app/api/admin/org/[orgId]/spend-cap/route.ts'), 'utf8');

describe('spend cap routes', () => {
  it('lets an org admin set only the organization limit', () => {
    expect(ORG).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(ORG).toMatch(/setOrgLimit/);
    expect(ORG).not.toMatch(/setPlatformLimit/);
  });

  // The platform pays for platform-funded spend, so an org raising its own
  // ceiling would make the cap advisory.
  it('confines the platform ceiling to an app admin', () => {
    expect(ADMIN).toMatch(/requireAppAdmin\(\)/);
    expect(ADMIN).toMatch(/setPlatformLimit/);
  });

  it('validates the behaviour against the three supported modes', () => {
    expect(ORG).toMatch(/'hard_stop'[\s\S]*'read_only'[\s\S]*'own_key'/);
  });

  it('returns the recomputed status so the client needs no second request', () => {
    expect(ORG).toMatch(/getStatus\(\)/);
    expect(ADMIN).toMatch(/getStatus\(\)/);
  });
});
