import { test, expect, loginAs } from '../fixtures';
import { personas } from '../personas';

const COLD_APP_TIMEOUT = 120_000;

test.setTimeout(360_000);

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

test('visible onboarding wizard provisions a usable organization and portfolio', async ({ page, adminDb }) => {
  const orgName = 'Walkthrough Visible Onboarding Foundation';
  await adminDb.from('organizations').delete().eq('name', orgName);

  let orgId: string | null = null;
  try {
    await loginAs(page, 'newUser');
    await page.goto('/welcome');

    await expect(page.getByText("What's the name of your organization?")).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByPlaceholder('Your organization name…').fill(orgName);
    await page.getByRole('button', { name: 'Send' }).click();

    await page.getByRole('button', { name: 'Family Foundation' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();

    await expect(page.getByRole('button', { name: 'Tax Center', exact: true })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByRole('button', { name: 'Donor CRM', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Looks good/ }).click();

    await page.waitForURL(url => url.pathname === '/dashboard', {
      timeout: COLD_APP_TIMEOUT,
      waitUntil: 'domcontentloaded',
    });

    const { data: profile, error: profileError } = await adminDb
      .from('profiles')
      .select('id')
      .eq('email', personas.newUser.email)
      .single();
    expect(profileError).toBeNull();

    const { data: org, error: orgError } = await adminDb
      .from('organizations')
      .select('id, name, org_type, modules')
      .eq('name', orgName)
      .single();
    expect(orgError).toBeNull();
    orgId = org!.id;
    expect(org).toMatchObject({
      name: orgName,
      org_type: 'private_foundation',
    });
    expect(org?.modules).toMatchObject({
      portfolio: true,
      tax: true,
      donors: false,
      compliance: false,
      quickbooks: false,
    });

    const [{ data: membership }, { data: portfolio }, me] = await Promise.all([
      adminDb
        .from('organization_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', profile!.id)
        .single(),
      adminDb
        .from('portfolios')
        .select('id, org_id, owner_id, settings')
        .eq('org_id', orgId)
        .single(),
      page.context().request.get('/api/me'),
    ]);

    expect(membership?.role).toBe('owner');
    expect(portfolio).toMatchObject({
      org_id: orgId,
      owner_id: profile!.id,
      settings: { base_currency: 'USD' },
    });
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      organization_id: orgId,
      recommended_portfolio_id: portfolio?.id,
    });
  } finally {
    if (orgId) {
      await adminDb.from('organizations').delete().eq('id', orgId);
    } else {
      await adminDb.from('organizations').delete().eq('name', orgName);
    }
  }
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
