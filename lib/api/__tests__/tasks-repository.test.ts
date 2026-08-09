// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrgTaskRepository } from '@/lib/api/repositories/tasks';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRunAutomationRulesForEvent } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRunAutomationRulesForEvent: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/dynamic-rules', () => ({
  runAutomationRulesForEvent: mockRunAutomationRulesForEvent,
}));

const db = { from: mockFrom };
const adminScope = { orgId: 'org-1', role: 'admin' as const, actorId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRunAutomationRulesForEvent.mockResolvedValue([]);
});

describe('createOrgTaskRepository', () => {
  it('loads task-page organization and member context through the bound organization', async () => {
    const orgQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'org-1', name: 'Org One' }, error: null } }
    );
    const membersQuery = stubQuery({
      data: [{ user_id: 'user-1', role: 'admin' }],
      error: null,
    });
    const profilesQuery = stubQuery({
      data: [{ id: 'user-1', full_name: 'Admin User', email: 'admin@example.test' }],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(orgQuery)
      .mockReturnValueOnce(membersQuery)
      .mockReturnValueOnce(profilesQuery);

    const context = await createOrgTaskRepository(adminScope).getPageContext();

    expect(orgQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] });
    expect(membersQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(membersQuery.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
    expect(context).toEqual({
      org: { id: 'org-1', name: 'Org One' },
      members: [{
        user_id: 'user-1',
        role: 'admin',
        profiles: { id: 'user-1', full_name: 'Admin User', email: 'admin@example.test' },
      }],
    });
  });

  it('forces organization and actor filters on task listing', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createOrgTaskRepository(adminScope).list({
      tab: 'mine',
      limit: 25,
    });

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['assigned_to', 'user-1'] });
    expect(query.calls).toContainEqual({ method: 'limit', args: [25] });
  });

  it('loads a detail task only through the scoped organization', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'task-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    await createOrgTaskRepository(adminScope).get('task-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'task-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('prevents a member from updating another assignee task before writing', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'task-1', assigned_to: 'user-2' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    await expect(createOrgTaskRepository({
      orgId: 'org-1',
      role: 'member',
      actorId: 'user-1',
    }).update('task-1', { status: 'completed' })).rejects.toEqual(
      expect.objectContaining({
        message: 'Not authorized to update this task',
        status: 403,
      })
    );
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('validates a linked entity in the same org before creating scoped rows', async () => {
    const donorQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'donor-1' }, error: null } }
    );
    const taskQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'task-1', title: 'Follow up' }, error: null } }
    );
    const linksQuery = stubQuery({ data: null, error: null });
    const eventsQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(donorQuery)
      .mockReturnValueOnce(taskQuery)
      .mockReturnValueOnce(linksQuery)
      .mockReturnValueOnce(eventsQuery);

    await createOrgTaskRepository(adminScope).create({
      title: 'Follow up',
      entity_links: [{
        entity_type: 'donor',
        entity_id: '11111111-1111-1111-1111-111111111111',
      }],
    });

    expect(donorQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(taskQuery.calls).toContainEqual({
      method: 'insert',
      args: [{ title: 'Follow up', org_id: 'org-1', created_by: 'user-1' }],
    });
    expect(linksQuery.calls).toContainEqual({
      method: 'insert',
      args: [[expect.objectContaining({ task_id: 'task-1', org_id: 'org-1' })]],
    });
    expect(eventsQuery.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({ task_id: 'task-1', org_id: 'org-1', actor_id: 'user-1' })],
    });
  });

  it('rejects an entity link not found in the scoped organization', async () => {
    const donorQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(donorQuery);

    await expect(createOrgTaskRepository(adminScope).create({
      title: 'Follow up',
      entity_links: [{
        entity_type: 'donor',
        entity_id: '22222222-2222-2222-2222-222222222222',
      }],
    })).rejects.toEqual(expect.objectContaining({
      message: 'Linked donor does not belong to this organization',
      status: 400,
    }));
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createOrgTaskRepository(adminScope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
