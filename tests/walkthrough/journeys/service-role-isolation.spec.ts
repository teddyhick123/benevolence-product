import { test, expect, loginAs } from '../fixtures';
import { fixtureIds } from '../personas';

async function expectNoGammaLeak(response: { text(): Promise<string>; status(): number }) {
  expect([401, 403, 404]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toContain('Gamma Foundation');
  expect(body).not.toContain('Gamma Private Portfolio');
  expect(body).not.toContain('Gamma Confidential Initiative');
  expect(body).not.toContain('900000');
}

test('service-role backed export and module routes preserve tenant isolation', async ({ page }) => {
  await loginAs(page, 'orgOwner');

  const alphaCompliance = await page.request.get(`/api/org/${fixtureIds.orgs.alpha}/compliance/dashboard`);
  expect(alphaCompliance.status()).toBe(200);

  const gammaCompliance = await page.request.get(`/api/org/${fixtureIds.orgs.gamma}/compliance/dashboard`);
  await expectNoGammaLeak(gammaCompliance);

  const gammaGrantExport = await page.request.get(
    `/api/portfolio/${fixtureIds.portfolios.gamma}/grants/export?format=json`
  );
  await expectNoGammaLeak(gammaGrantExport);

  const gammaTaxExport = await page.request.get(
    `/api/portfolio/${fixtureIds.portfolios.gamma}/tax/export?year=2024&format=json`
  );
  await expectNoGammaLeak(gammaTaxExport);

  const gammaCpaShares = await page.request.get(
    `/api/portfolio/${fixtureIds.portfolios.gamma}/tax/cpa-share`
  );
  await expectNoGammaLeak(gammaCpaShares);
});
