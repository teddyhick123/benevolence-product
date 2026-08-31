// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ROUTE = readFileSync(
  join(ROOT, 'app/api/org/[orgId]/ai-settings/usage/route.ts'), 'utf8',
);
const SETTINGS = readFileSync(join(ROOT, 'lib/api/repositories/ai-settings.ts'), 'utf8');

describe('usage endpoint', () => {
  it('guards org admin access', () => {
    expect(ROUTE).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  it('reads the report from SQL rather than reducing rows in TypeScript', () => {
    expect(ROUTE).toMatch(/org_ai_usage_report/);
    expect(ROUTE).not.toMatch(/\.reduce\(/);
  });

  it('returns cap status alongside the report', () => {
    expect(ROUTE).toMatch(/getStatus\(\)/);
  });

  // The heavy aggregation moves out; the settings payload keeps only status.
  it('drops the in-memory usage reduction from the settings payload', () => {
    expect(SETTINGS).not.toMatch(/usageRows\.reduce/);
    expect(SETTINGS).not.toMatch(/usageSummary/);
  });

  it('keeps cap status on the settings payload so the routing UI can read it', () => {
    // Shorthand property: the value is built above and spread in by name.
    expect(SETTINGS).toMatch(/^\s*cap,$/m);
    expect(SETTINGS).toMatch(/createAISpendCapRepository\([\s\S]*?\)\.getStatus\(\)/);
  });
});
