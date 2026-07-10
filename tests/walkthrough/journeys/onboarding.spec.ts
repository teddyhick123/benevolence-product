import { test, expect, loginAs } from '../fixtures';
import { personas } from '../personas';

const COLD_APP_TIMEOUT = 120_000;

test.setTimeout(360_000);

test('Foundation Setup turns intake into a visible Blueprint before the AI conversation begins', async ({ page, adminDb }) => {
  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', personas.newUser.email)
    .single();
  expect(profileError).toBeNull();
  await adminDb.from('onboarding_sessions').delete().eq('user_id', profile!.id);

  await loginAs(page, 'newUser', { landOnDashboard: false });
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'Private Foundation' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Organization Name').fill('Foundation Setup Walkthrough');
  await page.getByRole('button', { name: 'Just me' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start Conversation' }).click();

  await expect(page.getByRole('heading', { name: 'Foundation Setup' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
  await expect(page.getByRole('heading', { name: 'Foundation Blueprint' })).toBeVisible();
  await expect(page.getByText(/what would make this workspace indispensable over the next 90 days/i)).toBeVisible();
  await expect(page.getByText('Your dashboard priorities')).toBeVisible();
});

test('new user provisioning creates a usable canonical organization and portfolio', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');
  const request = page.context().request;
  await page.close();

  let orgId: string | null = null;
  try {
    const response = await request.post('/api/onboarding/provision', {
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

    const me = await request.get('/api/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      organization_id: orgId,
      recommended_portfolio_id: provisioned.portfolio_id,
    });
  } finally {
    if (orgId) await adminDb.from('organizations').delete().eq('id', orgId);
  }
});

test('legacy welcome route redirects to canonical Foundation Setup', async ({ page }) => {
  await loginAs(page, 'newUser', { landOnDashboard: false });
  await page.goto('/welcome');

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText('What type of organization are you?')).toBeVisible({ timeout: COLD_APP_TIMEOUT });
});

test('new user provisioning is idempotent after success', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');
  const request = page.context().request;
  await page.close();

  let orgId: string | null = null;
  try {
    const first = await request.post('/api/onboarding/provision', {
      data: {
        name: 'Walkthrough Duplicate Submit Foundation',
        org_type: 'private_foundation',
        modules: { portfolio: true, grant_management: true },
      },
    });
    expect(first.status()).toBe(201);
    const firstJson = await first.json();
    orgId = firstJson.org_id;

    const second = await request.post('/api/onboarding/provision', {
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
  const request = page.context().request;
  await page.close();

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

  const missingName = await request.post('/api/onboarding/provision', {
    data: { org_type: 'private_foundation' },
  });
  expect(missingName.status()).toBe(400);

  const invalidType = await request.post('/api/onboarding/provision', {
    data: { name: 'Invalid Type Foundation', org_type: 'daf' },
  });
  expect(invalidType.status()).toBe(400);

  const { count: afterMemberships } = await adminDb
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile!.id);

  expect(afterMemberships).toBe(beforeMemberships);
});

test('simulated provisioning failure rolls back organization, membership, and portfolio rows', async ({ page, adminDb }) => {
  await loginAs(page, 'newUser');
  const request = page.context().request;
  await page.close();

  const orgName = 'Walkthrough Rollback Foundation';
  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', personas.newUser.email)
    .single();
  expect(profileError).toBeNull();

  const response = await request.post('/api/onboarding/provision', {
    headers: { 'x-walkthrough-fail-after': 'portfolio' },
    data: {
      name: orgName,
      org_type: 'private_foundation',
      modules: { portfolio: true, grant_management: true },
    },
  });
  expect(response.status()).toBe(500);

  const [{ count: orgCount }, { count: membershipCount }, { count: portfolioCount }] = await Promise.all([
    adminDb
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .eq('name', orgName),
    adminDb
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile!.id),
    adminDb
      .from('portfolios')
      .select('*', { count: 'exact', head: true })
      .eq('name', orgName),
  ]);

  expect(orgCount).toBe(0);
  expect(membershipCount).toBe(0);
  expect(portfolioCount).toBe(0);
});
