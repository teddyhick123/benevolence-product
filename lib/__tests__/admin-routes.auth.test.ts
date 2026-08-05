// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('admin route auth contracts', () => {
  it('remaining admin console routes use typed access contexts and no route client factories', () => {
    const appAdminRoutes = [
      'app/api/admin/demo/load/route.ts',
      'app/api/admin/kpis/[kpiId]/route.ts',
      'app/api/admin/portfolios/[id]/settings/route.ts',
      'app/api/admin/portfolios/route.ts',
    ];
    for (const route of appAdminRoutes) {
      const source = readFileSync(route, 'utf8');
      expect(source, route).toContain('requireAppAdmin');
      expect(source, route).not.toContain('createServerClient');
      expect(source, route).not.toContain('createSupabaseServerClient');
    }

    const memberRoute = readFileSync(
      'app/api/admin/portfolios/[id]/members/[userId]/route.ts',
      'utf8'
    );
    expect(memberRoute).toContain('requirePortfolioManagerOrAppAdmin');
    expect(memberRoute).not.toContain('createSupabaseServerClient');

    const adminStatus = readFileSync('app/api/admin/is_admin/route.ts', 'utf8');
    expect(adminStatus).toContain('requireUserAccess');
    expect(adminStatus).not.toContain('createSupabaseServerClient');
  });

  it('admin portfolio creation uses canonical organization and settings columns', () => {
    const route = readFileSync('app/api/admin/portfolios/route.ts', 'utf8');
    const migration = readFileSync('db/migrations/0023_admin_superuser_policies.sql', 'utf8');

    expect(route).toContain('org_id: ownerMembership.org_id');
    expect(route).toContain('owner_id: owner_user_id');
    expect(route).toContain('settings: { base_currency }');
    expect(route).not.toContain("select('user_id')");
    expect(migration).toContain('portfolios: app admin full access');
    expect(migration).toContain('portfolio_settings: app admin full access');
    expect(migration).toContain('kpi_definitions: app admin full access');
  });

  it('first-admin bootstrap uses the authenticated session and atomic canonical RPC', () => {
    const route = readFileSync('app/api/admin/bootstrap/route.ts', 'utf8');
    const migration = readFileSync('db/migrations/0023_admin_superuser_policies.sql', 'utf8');

    expect(route).toContain('requireUserAccess');
    expect(route).toContain("rpc('bootstrap_app_admin')");
    expect(route).not.toContain('createAdminClient');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION bootstrap_app_admin()');
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('bootstrap_app_admin'))");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION bootstrap_app_admin() TO authenticated');
  });

  it('portfolio member administration uses the shared manager guard and canonical membership constraints', () => {
    const route = readFileSync('app/api/admin/portfolios/[id]/members/route.ts', 'utf8');
    const migration = readFileSync('db/migrations/0023_admin_superuser_policies.sql', 'utf8');

    expect(route).toContain('requirePortfolioManagerOrAppAdmin');
    expect(route).not.toContain("select('user_id')");
    expect(route).not.toContain('createClient');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(migration).toContain('portfolio_members: app admin full access');
  });

  it('auth-directory lookup requires app admin and hides elevated access in a scoped repository', () => {
    const route = readFileSync('app/api/admin/users/lookup/route.ts', 'utf8');

    expect(route).toContain('requireAppAdmin');
    expect(route).toContain('createAppAdminDirectoryRepository');
    expect(route).not.toContain('createClient');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
  });

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

  it('admin upload ingestion routes use the shared app-admin guard and scoped ingestion repository', () => {
    for (const route of [
      'app/api/admin/upload/route.ts',
      'app/api/admin/upload/ingest/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('requireAppAdmin');
      expect(src, route).toContain('createAppAdminUploadIngestionRepository');
      expect(src, route).toContain('jsonOk');
      expect(src, route).not.toContain('createClient');
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).not.toContain('requireAdmin');
      expect(src, route).not.toContain('SUPABASE_SERVICE_ROLE');
    }
  });
});
