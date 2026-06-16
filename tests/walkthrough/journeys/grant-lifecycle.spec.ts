import { test, expect, loginAs } from '../fixtures';
import { fixtureIds } from '../personas';

test('grant lifecycle validates transitions, records history, and rejects viewers', async ({ page, adminDb }) => {
  await loginAs(page, 'orgAdmin');

  try {
    const invalid = await page.request.post(
      `/api/org/${fixtureIds.orgs.alpha}/grants/${fixtureIds.grants.alphaDraft}/transition`,
      { data: { to_stage: 'approved', reason: 'Skip required stages' } }
    );
    expect(invalid.status()).toBe(422);

    const valid = await page.request.post(
      `/api/org/${fixtureIds.orgs.alpha}/grants/${fixtureIds.grants.alphaDraft}/transition`,
      { data: { to_stage: 'prospect', reason: 'Ready for initial outreach' } }
    );
    expect(valid.status()).toBe(200);

    const { data: grant } = await adminDb
      .from('grants')
      .select('lifecycle_stage')
      .eq('id', fixtureIds.grants.alphaDraft)
      .single();
    expect(grant?.lifecycle_stage).toBe('prospect');

    const { data: history } = await adminDb
      .from('grant_status_history')
      .select('from_stage, to_stage, reason')
      .eq('grant_id', fixtureIds.grants.alphaDraft)
      .eq('to_stage', 'prospect')
      .single();
    expect(history).toEqual({
      from_stage: 'draft',
      to_stage: 'prospect',
      reason: 'Ready for initial outreach',
    });

    await page.context().clearCookies();
    await loginAs(page, 'viewer');
    const viewerMutation = await page.request.post(
      `/api/org/${fixtureIds.orgs.alpha}/grants/${fixtureIds.grants.alphaDraft}/transition`,
      { data: { to_stage: 'invited' } }
    );
    expect(viewerMutation.status()).toBe(403);
  } finally {
    await adminDb.from('grants').update({ lifecycle_stage: 'draft' }).eq('id', fixtureIds.grants.alphaDraft);
    await adminDb
      .from('grant_status_history')
      .delete()
      .eq('grant_id', fixtureIds.grants.alphaDraft)
      .neq('id', 'aaaaaaaa-3000-4000-8000-000000000001');
  }
});
