import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds, personas } from '../personas';

const COLD_APP_TIMEOUT = 180_000;

test.setTimeout(600_000);

async function deleteTasksByTitle(adminDb: any, title: string) {
  const { data: tasks } = await adminDb
    .from('tasks')
    .select('id')
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('title', title);

  const taskIds = (tasks ?? []).map((task: { id: string }) => task.id);
  if (taskIds.length === 0) return;

  await adminDb.from('task_events').delete().in('task_id', taskIds);
  await adminDb.from('task_entity_links').delete().in('task_id', taskIds);
  await adminDb.from('tasks').delete().in('id', taskIds);
}

test('UI mission: admin enables donor management and reaches the donor workspace', async ({ page, adminDb }) => {
  await adminDb
    .from('organizations')
    .update({ modules: { portfolio: true, donors: false } })
    .eq('id', fixtureIds.orgs.beta);

  await loginAs(page, 'multiOrgMember');
  await setActiveOrg(page, fixtureIds.orgs.beta);

  try {
    await page.goto(`/org/${fixtureIds.orgs.beta}/settings/modules`);
    await expect(page.getByRole('heading', { name: 'Module Settings' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: 'Enable Donor Management' }).click();
    await expect(page.getByRole('button', { name: 'Disable Donor Management' })).toBeVisible();

    await expect.poll(async () => {
      const { data } = await adminDb
        .from('organizations')
        .select('modules')
        .eq('id', fixtureIds.orgs.beta)
        .single();
      return data?.modules?.donors;
    }).toBe(true);

    await page.goto('/dashboard/donors');
    await expect(page.getByRole('heading', { name: 'Donors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Donor Management not enabled' })).toHaveCount(0);
  } finally {
    await adminDb
      .from('organizations')
      .update({ modules: { portfolio: true, donors: false } })
      .eq('id', fixtureIds.orgs.beta);
  }
});

test('UI mission: org admin creates, completes, and reopens a task from the inbox', async ({ page, adminDb }) => {
  const title = 'Walkthrough UI Mission Task';
  await deleteTasksByTitle(adminDb, title);

  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto(`/org/${fixtureIds.orgs.alpha}/tasks`);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();

    await page.getByRole('button', { name: 'New Task' }).click();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Assignee').selectOption({ label: personas.orgAdmin.fullName });
    await page.getByLabel('Priority').selectOption('high');
    await page.getByLabel('Description').fill('Created by the UI mission walkthrough.');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText(title)).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: `Complete task ${title}` }).click();
    await expect(page.getByRole('button', { name: `Reopen task ${title}` }).first()).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await expect.poll(async () => {
      const { data } = await adminDb
        .from('tasks')
        .select('status')
        .eq('org_id', fixtureIds.orgs.alpha)
        .eq('title', title)
        .single();
      return data?.status;
    }).toBe('completed');

    await page.getByRole('button', { name: `Reopen task ${title}` }).first().click();
    await expect(page.getByRole('button', { name: `Complete task ${title}` })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: task } = await adminDb
      .from('tasks')
      .select('id, status, priority, assigned_to')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('title', title)
      .single();
    expect(task?.status).toBe('open');
    expect(task?.priority).toBe('high');

    const { data: assignee } = await adminDb
      .from('profiles')
      .select('email')
      .eq('id', task?.assigned_to)
      .single();
    expect(assignee?.email).toBe(personas.orgAdmin.email);
  } finally {
    await deleteTasksByTitle(adminDb, title);
  }
});

test('UI mission: org admin transitions a grant through visible pipeline controls', async ({ page, adminDb }) => {
  await adminDb.from('grants').update({ lifecycle_stage: 'draft' }).eq('id', fixtureIds.grants.alphaDraft);
  await adminDb
    .from('grant_status_history')
    .delete()
    .eq('grant_id', fixtureIds.grants.alphaDraft)
    .neq('id', 'aaaaaaaa-3000-4000-8000-000000000001');

  await loginAs(page, 'orgAdmin');

  try {
    await page.goto('/dashboard/grants');
    await expect(page.getByRole('heading', { name: 'Grant Management' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: 'Select' }).click();
    await page.getByText('Alpha Education Initiative').click();
    await page.locator('select').selectOption('prospect');
    await page.getByRole('button', { name: 'Apply transitions' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('All transitions applied')).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByRole('button', { name: 'Done' }).click();

    const [{ data: grant }, { count: prospectHistoryCount }] = await Promise.all([
      adminDb
        .from('grants')
        .select('lifecycle_stage')
        .eq('id', fixtureIds.grants.alphaDraft)
        .single(),
      adminDb
        .from('grant_status_history')
        .select('*', { count: 'exact', head: true })
        .eq('grant_id', fixtureIds.grants.alphaDraft)
        .eq('to_stage', 'prospect'),
    ]);

    expect(grant?.lifecycle_stage).toBe('prospect');
    expect(prospectHistoryCount).toBe(1);
  } finally {
    await adminDb.from('grants').update({ lifecycle_stage: 'draft' }).eq('id', fixtureIds.grants.alphaDraft);
    await adminDb
      .from('grant_status_history')
      .delete()
      .eq('grant_id', fixtureIds.grants.alphaDraft)
      .neq('id', 'aaaaaaaa-3000-4000-8000-000000000001');
  }
});
