import { test, expect, loginAs } from '../fixtures';
import { personas } from '../personas';

test('new user provisioning creates a usable canonical organization and portfolio', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');

  let orgId: string | null = null;
  try {
    const response = await page.request.post('/api/onboarding/provision', {
      data: {
        name: 'Walkthrough Provisioned Foundation',
        org_type: 'private_foundation',
        modules: { portfolio: true, grant_management: true },
      },
    });
    expect(response.status()).toBe(201);

    const provisioned = await response.json();
    orgId = provisioned.org_id;
    expect(provisioned.portfolio_id).toBeTruthy();

    const { data: portfolio, error: portfolioError } = await adminDb
      .from('portfolios')
      .select('id, org_id, owner_id, settings')
      .eq('id', provisioned.portfolio_id)
      .single();
    expect(portfolioError).toBeNull();
    expect(portfolio).toMatchObject({
      id: provisioned.portfolio_id,
      org_id: orgId,
      settings: { base_currency: 'USD' },
    });
    expect(portfolio?.owner_id).toBeTruthy();

    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      organization_id: orgId,
      recommended_portfolio_id: provisioned.portfolio_id,
    });
  } finally {
    if (orgId) await adminDb.from('organizations').delete().eq('id', orgId);
  }
});

test('new user provisioning is idempotent after success', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');

  let orgId: string | null = null;
  try {
    const first = await page.request.post('/api/onboarding/provision', {
      data: {
        name: 'Walkthrough Duplicate Submit Foundation',
        org_type: 'private_foundation',
        modules: { portfolio: true, grant_management: true },
      },
    });
    expect(first.status()).toBe(201);
    const firstJson = await first.json();
    orgId = firstJson.org_id;

    const second = await page.request.post('/api/onboarding/provision', {
      data: {
        name: 'Walkthrough Duplicate Submit Foundation',
        org_type: 'private_foundation',
        modules: { portfolio: true, grant_management: true },
      },
    });
    expect(second.status()).toBe(409);

    const { data: profile, error: profileError } = await adminDb
      .from('profiles')
      .select('id')
      .eq('email', personas.newUser.email)
      .single();
    expect(profileError).toBeNull();

    const [{ count: membershipCount }, { count: portfolioCount }] = await Promise.all([
      adminDb
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile!.id),
      adminDb
        .from('portfolios')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId),
    ]);

    expect(membershipCount).toBe(1);
    expect(portfolioCount).toBe(1);
  } finally {
    if (orgId) await adminDb.from('organizations').delete().eq('id', orgId);
  }
});

test('invalid onboarding provisioning leaves no partial membership', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');

  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', personas.newUser.email)
    .single();
  expect(profileError).toBeNull();

  const { count: beforeMemberships } = await adminDb
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile!.id);

  const missingName = await page.request.post('/api/onboarding/provision', {
    data: { org_type: 'private_foundation' },
  });
  expect(missingName.status()).toBe(400);

  const invalidType = await page.request.post('/api/onboarding/provision', {
    data: { name: 'Invalid Type Foundation', org_type: 'daf' },
  });
  expect(invalidType.status()).toBe(400);

  const { count: afterMemberships } = await adminDb
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile!.id);

  expect(afterMemberships).toBe(beforeMemberships);
});
