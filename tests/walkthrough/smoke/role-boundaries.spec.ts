import { test, expect, loginAs } from '../fixtures';
import { fixtureIds } from '../personas';

test('viewer can read org resources but cannot mutate grants or modules', async ({ page }) => {
  await loginAs(page, 'viewer');

  const grants = await page.request.get(`/api/org/${fixtureIds.orgs.alpha}/grants`);
  expect(grants.status()).toBe(200);

  const createGrant = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/grants`, {
    data: {
      portfolio_id: fixtureIds.portfolios.alpha,
      purpose: 'Viewer must not create this',
      requested_amount: 1000,
      new_grantee: { display_name: 'Unauthorized Grantee' },
    },
  });
  expect(createGrant.status()).toBe(403);

  const modules = await page.request.get(`/api/org/${fixtureIds.orgs.alpha}/modules`);
  expect(modules.status()).toBe(200);

  const changeModules = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/modules`, {
    data: { action: 'disable', moduleId: 'donor_management' },
  });
  expect(changeModules.status()).toBe(403);
});

test('organization admin is not an application admin', async ({ page }) => {
  await loginAs(page, 'orgAdmin');

  const response = await page.request.get('/api/admin/is_admin');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ is_admin: false });
});
