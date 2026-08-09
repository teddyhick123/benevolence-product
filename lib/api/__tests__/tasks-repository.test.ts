// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrgTaskRepository } from '@/lib/api/repositories/tasks';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc, mockDrainOutbox } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockDrainOutbox: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/outbox', () => ({
  drainTaskAutomationOutbox: mockDrainOutbox,
}));

const db = { from: mockFrom, rpc: mockRpc };
const adminScope = { orgId: 'org-1', role: 'admin' as const, actorId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockDrainOutbox.mockResolvedValue({ errors: [] });
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

  it('maps transactional assignee authorization failures before any direct write', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });

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
    expect(mockRpc).toHaveBeenCalledWith('update_task_with_event', {
      p_expected_org_id: 'org-1',
      p_task_id: 'task-1',
      p_actor_id: 'user-1',
      p_is_workspace_manager: false,
      p_updates: { status: 'completed' },
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('passes task creation and entity links to one scoped transaction', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'task-1', title: 'Follow up', org_id: 'org-1' },
      error: null,
    });

    await createOrgTaskRepository(adminScope).create({
      title: 'Follow up',
      entity_links: [{
        entity_type: 'donor',
        entity_id: '11111111-1111-1111-1111-111111111111',
      }],
    });

    expect(mockRpc).toHaveBeenCalledWith('create_task_with_relations', {
      p_expected_org_id: 'org-1',
      p_actor_id: 'user-1',
      p_task: { title: 'Follow up' },
      p_entity_links: [{
        entity_type: 'donor',
        entity_id: '11111111-1111-1111-1111-111111111111',
      }],
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects an entity link not found in the scoped organization', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'Linked donor does not belong to this organization' },
    });

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
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('completes a task transactionally and dispatches only its durable outbox event', async () => {
    mockRpc.mockResolvedValue({
      data: {
        task: { id: 'task-1', status: 'completed' },
        idempotent: false,
        outbox_event_id: 'outbox-1',
      },
      error: null,
    });

    const result = await createOrgTaskRepository(adminScope).complete('task-1');

    expect(mockRpc).toHaveBeenCalledWith('set_task_completion_state', {
      p_expected_org_id: 'org-1',
      p_task_id: 'task-1',
      p_actor_id: 'user-1',
      p_is_workspace_manager: true,
      p_action: 'complete',
    });
    expect(mockDrainOutbox).toHaveBeenCalledWith(db, {
      orgId: 'org-1',
      eventId: 'outbox-1',
      limit: 1,
    });
    expect(result).toEqual({ task: { id: 'task-1', status: 'completed' }, idempotent: false });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createOrgTaskRepository(adminScope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
