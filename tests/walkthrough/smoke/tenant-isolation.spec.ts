import { test, expect, loginAs } from '../fixtures';
import { fixtureIds } from '../personas';

test('Alpha owner can access Alpha but not Gamma portfolio APIs', async ({ page, adminDb }) => {
  await loginAs(page, 'orgOwner');

  const alphaResponse = await page.request.get(`/api/portfolio/${fixtureIds.portfolios.alpha}/meta`);
  expect(alphaResponse.status()).toBe(200);
  expect(await alphaResponse.json()).toMatchObject({ name: 'Alpha Impact Portfolio' });

  const gammaResponse = await page.request.get(`/api/portfolio/${fixtureIds.portfolios.gamma}/meta`);
  expect(gammaResponse.status()).toBe(403);

  const { data: gamma, error } = await adminDb
    .from('holdings')
    .select('name, org_id')
    .eq('id', fixtureIds.holdings.gammaGrant)
    .single();
  expect(error).toBeNull();
  expect(gamma).toEqual({
    name: 'Gamma Confidential Initiative',
    org_id: fixtureIds.orgs.gamma,
  });
});

test('outsider cannot access Alpha portfolio APIs', async ({ page }) => {
  await loginAs(page, 'outsider');

  const alphaResponse = await page.request.get(`/api/portfolio/${fixtureIds.portfolios.alpha}/meta`);
  expect(alphaResponse.status()).toBe(403);

  const gammaResponse = await page.request.get(`/api/portfolio/${fixtureIds.portfolios.gamma}/meta`);
  expect(gammaResponse.status()).toBe(200);
});
