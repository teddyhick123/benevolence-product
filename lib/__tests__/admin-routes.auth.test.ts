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
    expect(src).toContain('requireAppAdmin');
    expect(src).toContain('createSignedUrl');
    expect(src).not.toContain('getPublicUrl');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
  });

  it('admin import AI row suggestions are admin-only, rate-limited, and table-allowlisted', () => {
    const src = readFileSync('app/api/admin/import/ai/suggest/route.ts', 'utf8');
    expect(src).toContain('requireAppAdmin');
    expect(src).toContain('aiLimiter.limit');
    expect(src).toContain('ALLOWED_STAGING_TABLES');
    expect(src).toContain('z.enum(ALLOWED_STAGING_TABLES)');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
  });

  it('admin Builder proposal routes use the shared app-admin guard and scoped repository', () => {
    for (const route of [
      'app/api/admin/builder/proposals/route.ts',
      'app/api/admin/builder/proposals/[proposalId]/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('requireAppAdmin');
      expect(src, route).toContain('createAppAdminBuilderRepository');
      expect(src, route).toContain('jsonOk');
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).not.toContain('requireAdmin');
    }
  });

  it('admin upload review routes use the shared app-admin guard and scoped repository', () => {
    for (const route of [
      'app/api/admin/staged-facts/[factId]/approve/route.ts',
      'app/api/admin/staged-facts/[factId]/route.ts',
      'app/api/admin/upload/[uploadId]/staged-facts/route.ts',
      'app/api/admin/upload/[uploadId]/status/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('requireAppAdmin');
      expect(src, route).toContain('createAppAdminUploadReviewRepository');
      expect(src, route).toContain('jsonOk');
      expect(src, route).not.toContain('createClient');
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).not.toContain('requireAdmin');
      expect(src, route).not.toContain('SUPABASE_SERVICE_ROLE');
    }
  });
});
