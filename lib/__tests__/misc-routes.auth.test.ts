// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/board-report/route.ts',
  'app/api/portfolio/[id]/bubble-chart/route.ts',
  'app/api/portfolio/[id]/comparison-table/route.ts',
  'app/api/portfolio/[id]/heat-map/route.ts',
  'app/api/portfolio/[id]/holdings/[holdingId]/geocode/route.ts',
  'app/api/portfolio/[id]/holdings/bulk-geocode/route.ts',
  'app/api/portfolio/[id]/widgets/route.ts',
  'app/api/portfolio/[id]/kpi-series/route.ts',
  'app/api/portfolio/[id]/letter/route.ts',
  'app/api/portfolio/[id]/letter/generate/route.ts',
  'app/api/portfolio/[id]/member-role/route.ts',
  'app/api/portfolio/[id]/meta/route.ts',
  'app/api/portfolio/[id]/metric-comparison/route.ts',
  'app/api/portfolio/[id]/recommendations/route.ts',
  'app/api/portfolio/[id]/role/route.ts',
  'app/api/portfolio/[id]/settings/route.ts',
  'app/api/portfolio/[id]/summary/route.ts',
  'app/api/portfolio/[id]/metrics/sector-aggregate/route.ts',
  'app/api/portfolio/[id]/timeline/route.ts',
  'app/api/portfolio/[id]/waterfall/route.ts',
];

describe('misc portfolio routes auth contract', () => {
  it('self-service and session routes keep cookie-backed auth construction in lib/api', () => {
    const userRoutes = [
      'app/api/me/route.ts',
      'app/api/profile/update/route.ts',
      'app/api/profile/change-password/route.ts',
    ];
    for (const route of userRoutes) {
      const source = readFileSync(route, 'utf8');
      expect(source, route).toContain('requireUserAccess');
      expect(source, route).not.toContain('@supabase/ssr');
      expect(source, route).not.toContain('createServerClient');
    }

    const sessionRoute = readFileSync('app/api/auth/session/route.ts', 'utf8');
    expect(sessionRoute).toContain('setServerSession');
    expect(sessionRoute).toContain('clearServerSession');
    expect(sessionRoute).not.toContain('createSupabaseServerClient');
  });

  it('constructor chat uses the shared app-admin principal', () => {
    const source = readFileSync('app/api/constructor/chat/route.ts', 'utf8');
    expect(source).toContain('requireAppAdmin');
    expect(source).not.toContain('@supabase/ssr');
    expect(source).not.toContain('createServerClient');
  });

  it('portfolio settings reuses the database from the typed portfolio context', () => {
    const source = readFileSync('app/api/portfolio/[id]/settings/route.ts', 'utf8');
    expect(source).toContain("from '@/lib/api/access'");
    expect(source).toContain('access.context.db');
    expect(source).not.toContain('@supabase/ssr');
    expect(source).not.toContain('createServerClient');
  });

  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
      expect(src).not.toContain('createServerClient');
      expect(src).not.toContain('createSupabaseServerClient');
      expect(src).not.toContain("from '@/lib/portfolio-auth'");
    });

    it(`${route} calls isAccessDenied`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('isAccessDenied');
    });
  }

  for (const route of [
    'app/api/portfolio/[id]/widgets/route.ts',
    'app/api/portfolio/[id]/kpi-series/route.ts',
    'app/api/portfolio/[id]/meta/route.ts',
    'app/api/portfolio/[id]/settings/route.ts',
    'app/api/portfolio/[id]/map/route.ts',
  ]) {
    it(`${route} does not publicly cache portfolio-scoped data`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toMatch(/'Cache-Control': 'no-store'|@\/lib\/api\/responses/);
      expect(src).not.toContain('s-maxage');
      expect(src).not.toContain('public,');
    });
  }

  it('portfolio map requires typed portfolio access and has no privileged debug path', () => {
    const src = readFileSync('app/api/portfolio/[id]/map/route.ts', 'utf8');
    expect(src).toContain('requirePortfolioAccess');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('SERVICE_ROLE');
    expect(src).not.toContain('service_role_count');
    expect(src).not.toContain('createServiceClient');
  });

  it('public invitation routes use invitation/user principals and scoped elevated access', () => {
    const validationRoute = readFileSync('app/api/invitations/[token]/route.ts', 'utf8');
    const acceptRoute = readFileSync('app/api/invitations/[token]/accept/route.ts', 'utf8');
    const repository = readFileSync('lib/api/repositories/public-invitations.ts', 'utf8');

    expect(validationRoute).toContain('requireInvitationToken');
    expect(validationRoute).toContain('jsonOk');
    expect(acceptRoute).toContain('requireUserAccess');
    expect(acceptRoute).toContain('requireInvitationToken');
    expect(validationRoute).not.toContain('createAdminClient');
    expect(acceptRoute).not.toContain('createAdminClient');
    expect(acceptRoute).not.toContain('createServerClient');
    expect(repository).toContain(".eq('org_id', scope.orgId)");
    expect(repository).toContain("kind: 'invitation'");
  });

  it('onboarding session-core routes use a user principal and user-scoped repository', () => {
    const routeFiles = [
      'app/api/onboarding/session/route.ts',
      'app/api/onboarding/profile/route.ts',
      'app/api/onboarding/intake/route.ts',
    ];
    const repository = readFileSync('lib/api/repositories/onboarding.ts', 'utf8');

    for (const route of routeFiles) {
      const source = readFileSync(route, 'utf8');
      expect(source).toContain('requireUserAccess');
      expect(source).toContain('createOnboardingRepository');
      expect(source).not.toContain('createAdminClient');
      expect(source).not.toContain('createServerClient');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE');
    }
    expect(repository).toContain(".eq('user_id', userId)");
    expect(repository).toContain(".eq('id', scope.sessionId)");
    expect(repository).toContain(".eq('user_id', scope.userId)");
  });

  it('onboarding assistant routes keep credentials and elevated work behind owned sessions', () => {
    const routeFiles = [
      'app/api/onboarding/chat/route.ts',
      'app/api/onboarding/recommendations/route.ts',
    ];
    const repository = readFileSync('lib/api/repositories/onboarding.ts', 'utf8');

    for (const route of routeFiles) {
      const source = readFileSync(route, 'utf8');
      expect(source).toContain('requireUserAccess');
      expect(source).toContain('createOnboardingRepository');
      expect(source).not.toContain('createAdminClient');
      expect(source).not.toContain('createServerClient');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE');
      expect(source).not.toContain('OnboardingAssistant');
    }
    expect(repository).toContain('new OnboardingAssistant(db)');
    expect(repository).toContain(".eq('id', scope.sessionId)");
    expect(repository).toContain(".eq('user_id', scope.userId)");
  });

  it('onboarding provisioning uses a user principal and an operation-scoped provisioner', () => {
    const route = readFileSync('app/api/onboarding/provision/route.ts', 'utf8');
    const provisioner = readFileSync(
      'lib/api/repositories/onboarding-provisioning.ts',
      'utf8'
    );

    expect(route).toContain('requireUserAccess');
    expect(route).toContain('createOnboardingProvisioner');
    expect(route).not.toContain('createAdminClient');
    expect(route).not.toContain('createServerClient');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(provisioner).toContain(".eq('user_id', userId)");
    expect(provisioner).toContain('p_owner_user_id: userId');
    expect(provisioner).not.toContain('input.orgId');
  });

  it('classifies onboarding help as user-authenticated and completion as a public tombstone', () => {
    const assist = readFileSync('app/api/onboarding/assist/route.ts', 'utf8');
    const complete = readFileSync('app/api/onboarding/complete/route.ts', 'utf8');

    expect(assist).toContain('requireUserAccess');
    expect(assist).toContain('isAccessDenied');
    expect(assist).not.toContain('createServerClient');
    expect(complete).toContain('public');
    expect(complete).toContain('status: 410');
    expect(complete).not.toContain('createServerClient');
    expect(complete).not.toContain('createAdminClient');
  });
});
