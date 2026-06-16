import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

test('active organization selects the matching portfolio and scopes stale-tab mutations', async ({ page, adminDb }) => {
  await loginAs(page, 'multiOrgMember');

  await setActiveOrg(page, fixtureIds.orgs.beta);
  const betaMe = await page.request.get('/api/me');
  expect(betaMe.status()).toBe(200);
  expect(await betaMe.json()).toMatchObject({
    organization_id: fixtureIds.orgs.beta,
    recommended_portfolio_id: fixtureIds.portfolios.beta,
    portfolios: [{ id: fixtureIds.portfolios.beta, org_id: fixtureIds.orgs.beta }],
  });

  const staleMutation = await page.request.post(
    `/api/org/${fixtureIds.orgs.beta}/grants/${fixtureIds.grants.alphaDraft}/transition`,
    { data: { to_stage: 'prospect', reason: 'Stale Alpha tab after switching to Beta' } }
  );
  expect(staleMutation.status()).toBe(404);

  const { data: untouchedGrant, error } = await adminDb
    .from('grants')
    .select('lifecycle_stage')
    .eq('id', fixtureIds.grants.alphaDraft)
    .single();
  expect(error).toBeNull();
  expect(untouchedGrant?.lifecycle_stage).toBe('draft');

  await setActiveOrg(page, fixtureIds.orgs.alpha);
  const alphaMe = await page.request.get('/api/me');
  expect(alphaMe.status()).toBe(200);
  expect(await alphaMe.json()).toMatchObject({
    organization_id: fixtureIds.orgs.alpha,
    recommended_portfolio_id: fixtureIds.portfolios.alpha,
    portfolios: [{ id: fixtureIds.portfolios.alpha, org_id: fixtureIds.orgs.alpha }],
  });
});
