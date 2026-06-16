import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

test('minimal-module organization hides disabled product areas', async ({ page }) => {
  await loginAs(page, 'multiOrgMember');
  await setActiveOrg(page, fixtureIds.orgs.beta);

  const betaModules = await page.request.get(`/api/org/${fixtureIds.orgs.beta}/modules`);
  expect(betaModules.status()).toBe(200);
  expect((await betaModules.json()).enabledModules).toEqual(['core']);

  await page.goto('/dashboard/donors', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Donor Management not enabled' })).toBeVisible();
});

test('full-module organization exposes enabled product areas', async ({ page }) => {
  await loginAs(page, 'multiOrgMember');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  const alphaModules = await page.request.get(`/api/org/${fixtureIds.orgs.alpha}/modules`);
  expect(alphaModules.status()).toBe(200);
  expect((await alphaModules.json()).enabledModules).toContain('donor_management');
});
