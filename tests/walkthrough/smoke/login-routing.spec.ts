import { test, expect, loginAs } from '../fixtures';
import { fixtureIds } from '../personas';

test('app admin lands in the admin console', async ({ page }) => {
  await loginAs(page, 'appAdmin');
  await expect(page).toHaveURL(/\/admin\/console/);
  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
});

test('organization owner lands in the Alpha portfolio', async ({ page }) => {
  await loginAs(page, 'orgOwner');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Alpha Impact Portfolio')).toBeVisible();

  const me = await page.request.get('/api/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({
    recommended_portfolio_id: fixtureIds.portfolios.alpha,
  });
});

test('new user lands in onboarding', async ({ page }) => {
  await loginAs(page, 'newUser');
  await expect(page).toHaveURL(/\/onboarding/);
});
