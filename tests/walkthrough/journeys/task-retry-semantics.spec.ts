import { test, expect, loginAs } from '../fixtures';
import { fixtureIds, personas } from '../personas';

const taskId = 'aaaaaaaa-4000-4000-8000-000000000001';

test('task complete and reopen retries are idempotent and do not duplicate events', async ({ page, adminDb }) => {
  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', personas.orgAdmin.email)
    .single();
  expect(profileError).toBeNull();

  await adminDb.from('task_events').delete().eq('task_id', taskId);
  await adminDb.from('tasks').delete().eq('id', taskId);

  const { error: insertError } = await adminDb.from('tasks').insert({
    id: taskId,
    org_id: fixtureIds.orgs.alpha,
    portfolio_id: fixtureIds.portfolios.alpha,
    title: 'Walkthrough Retry Task',
    status: 'open',
    priority: 'normal',
    task_type: 'task',
    source: 'manual',
    created_by: profile!.id,
    assigned_to: profile!.id,
  });
  expect(insertError).toBeNull();

  try {
    await loginAs(page, 'orgAdmin');

    const firstComplete = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/tasks/${taskId}/complete`);
    expect(firstComplete.status()).toBe(200);
    expect((await firstComplete.json()).idempotent).toBeUndefined();

    const duplicateComplete = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/tasks/${taskId}/complete`);
    expect(duplicateComplete.status()).toBe(200);
    expect((await duplicateComplete.json()).idempotent).toBe(true);

    const { count: completedEvents } = await adminDb
      .from('task_events')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('event_type', 'completed');
    expect(completedEvents).toBe(1);

    const firstReopen = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/tasks/${taskId}/reopen`);
    expect(firstReopen.status()).toBe(200);
    expect((await firstReopen.json()).idempotent).toBeUndefined();

    const duplicateReopen = await page.request.post(`/api/org/${fixtureIds.orgs.alpha}/tasks/${taskId}/reopen`);
    expect(duplicateReopen.status()).toBe(200);
    expect((await duplicateReopen.json()).idempotent).toBe(true);

    const [{ count: reopenEvents }, { data: task, error: taskError }] = await Promise.all([
      adminDb
        .from('task_events')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('event_type', 'status_changed'),
      adminDb
        .from('tasks')
        .select('status, completed_at, completed_by')
        .eq('id', taskId)
        .single(),
    ]);
    expect(taskError).toBeNull();
    expect(reopenEvents).toBe(1);
    expect(task).toMatchObject({
      status: 'open',
      completed_at: null,
      completed_by: null,
    });
  } finally {
    await adminDb.from('task_events').delete().eq('task_id', taskId);
    await adminDb.from('tasks').delete().eq('id', taskId);
  }
});
