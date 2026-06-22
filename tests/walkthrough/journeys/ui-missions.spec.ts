import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds, personas } from '../personas';

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
    await expect(page.getByRole('heading', { name: 'Module Settings' })).toBeVisible({ timeout: 30_000 });

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

    await expect(page.getByText(title)).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: `Complete task ${title}` }).click();
    await expect(page.getByRole('button', { name: `Reopen task ${title}` }).first()).toBeVisible({ timeout: 60_000 });

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
    await expect(page.getByRole('button', { name: `Complete task ${title}` })).toBeVisible({ timeout: 60_000 });

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
