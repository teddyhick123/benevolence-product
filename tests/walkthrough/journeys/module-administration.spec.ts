import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

test('organization admin can enable a module and immediately reach its product area', async ({ page, adminDb }) => {
  await loginAs(page, 'multiOrgMember');
  await setActiveOrg(page, fixtureIds.orgs.beta);

  try {
    const enable = await page.request.post(`/api/org/${fixtureIds.orgs.beta}/modules`, {
      data: { action: 'enable', moduleId: 'donor_management' },
    });
    expect(enable.status()).toBe(200);

    const duplicateEnable = await page.request.post(`/api/org/${fixtureIds.orgs.beta}/modules`, {
      data: { action: 'enable', moduleId: 'donor_management' },
    });
    expect(duplicateEnable.status()).toBe(200);

    const modules = await page.request.get(`/api/org/${fixtureIds.orgs.beta}/modules`);
    expect((await modules.json()).enabledModules).toContain('donor_management');

    const { data: enabledState } = await adminDb
      .from('organizations')
      .select('modules')
      .eq('id', fixtureIds.orgs.beta)
      .single();
    expect(enabledState?.modules?.donors).toBe(true);

    await page.goto('/dashboard/donors');
    await expect(page.getByRole('heading', { name: 'Donors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Donor Management not enabled' })).toHaveCount(0);

    const disable = await page.request.post(`/api/org/${fixtureIds.orgs.beta}/modules`, {
      data: { action: 'disable', moduleId: 'donor_management' },
    });
    expect(disable.status()).toBe(200);

    const duplicateDisable = await page.request.post(`/api/org/${fixtureIds.orgs.beta}/modules`, {
      data: { action: 'disable', moduleId: 'donor_management' },
    });
    expect(duplicateDisable.status()).toBe(200);

    const { data: disabledState } = await adminDb
      .from('organizations')
      .select('modules')
      .eq('id', fixtureIds.orgs.beta)
      .single();
    expect(disabledState?.modules?.donors).toBe(false);
  } finally {
    const { data } = await adminDb.from('organizations').select('modules').eq('id', fixtureIds.orgs.beta).single();
    await adminDb
      .from('organizations')
      .update({ modules: { ...(data?.modules ?? {}), portfolio: true, donors: false } })
      .eq('id', fixtureIds.orgs.beta);
  }
});
