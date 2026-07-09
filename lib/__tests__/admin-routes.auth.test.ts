// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('admin route auth contracts', () => {
  it('operational admin GET routes require app-admin authorization', () => {
    for (const route of [
      'app/api/admin/jobs/[jobId]/route.ts',
      'app/api/admin/portfolios/[id]/kpis/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain("import { requireAdmin } from '@/lib/admin-auth'");
      expect(src, route).toContain('await requireAdmin()');
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }
  });

  it('admin import migration reports use signed URLs and no-store responses', () => {
    const src = readFileSync('app/api/admin/imports/[id]/report/route.ts', 'utf8');
    expect(src).toContain('requireAdmin');
    expect(src).toContain('createSignedUrl');
    expect(src).not.toContain('getPublicUrl');
    expect(src).toContain("'Cache-Control': 'no-store'");
  });

  it('admin import AI row suggestions are admin-only, rate-limited, and table-allowlisted', () => {
    const src = readFileSync('app/api/admin/import/ai/suggest/route.ts', 'utf8');
    expect(src).toContain('requireAdmin');
    expect(src).toContain('aiLimiter.limit');
    expect(src).toContain('ALLOWED_STAGING_TABLES');
    expect(src).toContain('ALLOWED_STAGING_TABLES.has(staging_table)');
    expect(src).toContain("'Cache-Control': 'no-store'");
  });
});
