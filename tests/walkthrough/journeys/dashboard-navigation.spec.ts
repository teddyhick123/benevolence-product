import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

const COLD_APP_TIMEOUT = 120_000;

test.setTimeout(360_000);

test('org admin can load high-value module workspaces from the Alpha baseline', async ({ page }) => {
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  const portfolioQuery = `portfolio_id=${encodeURIComponent(fixtureIds.portfolios.alpha)}`;
  const workspaces = [
    { path: '/dashboard', heading: /Alpha Impact Portfolio|Dashboard|Portfolio/i },
    { path: '/dashboard/donors', heading: 'Donors' },
    { path: '/dashboard/grants', heading: 'Grant Management' },
    { path: '/dashboard/tax', heading: 'Tax Center' },
    { path: '/dashboard/compliance', heading: 'Compliance' },
    { path: '/dashboard/analytics', heading: 'Analytics' },
    { path: '/dashboard/reports', heading: 'Reports' },
  ];

  for (const workspace of workspaces) {
    await page.goto(`${workspace.path}?${portfolioQuery}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: workspace.heading }).first()).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });
    await expect(page.getByText(/not enabled/i)).toHaveCount(0);
    await page.waitForLoadState('networkidle', { timeout: COLD_APP_TIMEOUT });
  }
});
