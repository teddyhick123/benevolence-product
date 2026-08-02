// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const routes = [
  'app/api/portfolio/[id]/board-report/route.ts',
  'app/api/portfolio/[id]/widgets/route.ts',
  'app/api/portfolio/[id]/kpi-series/route.ts',
  'app/api/portfolio/[id]/letter/route.ts',
  'app/api/portfolio/[id]/meta/route.ts',
  'app/api/portfolio/[id]/settings/route.ts',
  'app/api/portfolio/[id]/metrics/sector-aggregate/route.ts',
];

describe('misc portfolio routes auth contract', () => {
  for (const route of routes) {
    it(`${route} imports requirePortfolioAccess`, () => {
      const src = readFileSync(route, 'utf8');
      expect(src).toContain('requirePortfolioAccess');
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
});
