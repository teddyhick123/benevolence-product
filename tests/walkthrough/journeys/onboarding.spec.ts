import { test, expect, loginAs } from '../fixtures';

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
