import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { z } from 'zod';
import { createTaskSchema, updateTaskSchema } from '@/lib/schemas/task';
import { isWorkspaceManager } from '@/lib/roles';
import { drainTaskAutomationOutbox } from '@/lib/tasks/automation/outbox';

type TaskRepositoryScope = Pick<OrgAccessContext, 'orgId' | 'role'> & {
  actorId: string;
};

type CreateTaskInput = z.infer<typeof createTaskSchema>;
type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export type TaskListInput = {
  tab: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  entityType?: string;
  limit: number;
};

export class TaskRepositoryError extends Error {
  readonly status: 400 | 403 | 404;

  constructor(message: string, status: 400 | 403 | 404) {
    super(message);
    this.name = 'TaskRepositoryError';
    this.status = status;
  }
}

function normalizeTask(task: any, profilesById: Map<string, any>) {
  return {
    ...task,
    assignee: task.assigned_to ? profilesById.get(task.assigned_to) ?? null : null,
    creator: task.created_by ? profilesById.get(task.created_by) ?? null : null,
  };
}

type TaskMutationResult = {
  task: any;
  idempotent?: boolean;
  outbox_event_id?: string | null;
};

/** Elevated task operations constrained to one authorized org, role, and actor. */
export function createOrgTaskRepository(scope: TaskRepositoryScope) {
  const db = createElevatedClient();

  async function loadTask(taskId: string, selection = '*') {
    const { data, error } = await db
      .from('tasks')
      .select(selection)
      .eq('id', taskId)
      .eq('org_id', scope.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data as any;
  }

  function throwMutationError(
    error: { code?: string; message?: string },
    authorizationMessage: string
  ): never {
    if (error.code === 'P0002') throw new TaskRepositoryError('Task not found', 404);
    if (error.code === '42501') throw new TaskRepositoryError(authorizationMessage, 403);
    if (error.code === '22023') {
      throw new TaskRepositoryError(error.message || 'Invalid task mutation', 400);
    }
    throw error;
  }

  async function dispatchCompletionAutomation(outboxEventId?: string | null) {
    if (!outboxEventId) return;
    try {
      await drainTaskAutomationOutbox(db, {
        orgId: scope.orgId,
        eventId: outboxEventId,
        limit: 1,
      });
    } catch (automationError) {
      console.error('Task completion automation deferred for retry:', automationError);
    }
  }

  return {
    async getPageContext() {
      const [{ data: org, error: orgError }, { data: rawMembers, error: membersError }] =
        await Promise.all([
          db
            .from('organizations')
            .select('id, name')
            .eq('id', scope.orgId)
            .maybeSingle(),
          db
            .from('organization_members')
            .select('user_id, role')
            .eq('org_id', scope.orgId)
            .is('deleted_at', null)
            .order('role', { ascending: true }),
        ]);
      if (orgError) throw orgError;
      if (membersError) throw membersError;

      const userIds = (rawMembers ?? []).map((member: any) => member.user_id);
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await db.from('profiles').select('id, full_name, email').in('id', userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
      const members = (rawMembers ?? []).map((member: any) => ({
        ...member,
        profiles: profilesById.get(member.user_id) ?? null,
      }));

      return { org, members };
    },

    async list(input: TaskListInput) {
      let query = db
        .from('tasks')
        .select('*, task_entity_links(id, entity_type, entity_id, relationship)')
        .eq('org_id', scope.orgId)
        .is('deleted_at', null);

      if (input.tab === 'mine') query = query.eq('assigned_to', scope.actorId);
      if (input.tab === 'approvals') {
        query = query.eq('task_type', 'approval').not('status', 'in', '(completed,cancelled)');
      }
      if (input.tab === 'overdue') {
        query = query.lt('due_at', new Date().toISOString()).not('status', 'in', '(completed,cancelled)');
      }
      if (input.tab === 'open') query = query.not('status', 'in', '(completed,cancelled)');
      if (input.status) query = query.eq('status', input.status);
      if (input.priority) query = query.eq('priority', input.priority);
      if (input.assignedTo) query = query.eq('assigned_to', input.assignedTo);

      const { data, error } = await query
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(input.limit);
      if (error) throw error;

      let tasks = data || [];
      if (input.tab === 'due_soon') {
        const now = Date.now();
        const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
        tasks = tasks.filter((task: any) => {
          if (!task.due_at || ['completed', 'cancelled'].includes(task.status)) return false;
          const due = new Date(task.due_at).getTime();
          return due >= now && due <= sevenDays;
        });
      }
      if (input.entityType) {
        tasks = tasks.filter((task: any) =>
          (task.task_entity_links || []).some(
            (link: any) => link.entity_type === input.entityType
          )
        );
      }

      const ids = Array.from(new Set(
        tasks.flatMap((task: any) => [task.assigned_to, task.created_by]).filter(Boolean)
      ));
      const profilesById = new Map<string, any>();
      if (ids.length > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', ids);
        for (const profile of profiles || []) profilesById.set(profile.id, profile);
      }

      return tasks.map((task: any) => normalizeTask(task, profilesById));
    },

    async get(taskId: string) {
      return loadTask(
        taskId,
        '*, task_entity_links(id, entity_type, entity_id, relationship), task_comments(id, body, author_id, created_at)'
      );
    },

    async create(input: CreateTaskInput) {
      const { entity_links: entityLinks = [], ...taskFields } = input;
      const { data: task, error } = await db.rpc('create_task_with_relations', {
        p_expected_org_id: scope.orgId,
        p_actor_id: scope.actorId,
        p_task: taskFields,
        p_entity_links: entityLinks,
      });
      if (error) throwMutationError(error, 'Not authorized to create this task');
      return task;
    },

    async update(taskId: string, input: UpdateTaskInput) {
      const { data, error } = await db.rpc('update_task_with_event', {
        p_expected_org_id: scope.orgId,
        p_task_id: taskId,
        p_actor_id: scope.actorId,
        p_is_workspace_manager: isWorkspaceManager(scope.role),
        p_updates: input,
      });
      if (error) throwMutationError(error, 'Not authorized to update this task');
      const result = data as TaskMutationResult;
      await dispatchCompletionAutomation(result.outbox_event_id);
      return result.task;
    },

    async remove(taskId: string) {
      const existing = await loadTask(taskId, 'id, created_by');
      if (!existing) throw new TaskRepositoryError('Task not found', 404);
      if (!isWorkspaceManager(scope.role) && existing.created_by !== scope.actorId) {
        throw new TaskRepositoryError('Only task creators or admins can delete a task', 403);
      }

      const { data: deleted, error } = await db
        .from('tasks')
        .update({ deleted_at: new Date().toISOString(), deleted_by: scope.actorId })
        .eq('id', taskId)
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!deleted) throw new TaskRepositoryError('Task not found', 404);
    },

    async addComment(taskId: string, body: string) {
      const { data: comment, error } = await db.rpc('add_task_comment_with_event', {
        p_expected_org_id: scope.orgId,
        p_task_id: taskId,
        p_actor_id: scope.actorId,
        p_body: body,
      });
      if (error) throwMutationError(error, 'Not authorized to comment on this task');
      return comment;
    },

    async complete(taskId: string) {
      const { data, error } = await db.rpc('set_task_completion_state', {
        p_expected_org_id: scope.orgId,
        p_task_id: taskId,
        p_actor_id: scope.actorId,
        p_is_workspace_manager: isWorkspaceManager(scope.role),
        p_action: 'complete',
      });
      if (error) throwMutationError(error, 'Not authorized to complete this task');
      const result = data as TaskMutationResult;
      await dispatchCompletionAutomation(result.outbox_event_id);
      return { task: result.task, idempotent: result.idempotent === true };
    },

    async reopen(taskId: string) {
      const { data, error } = await db.rpc('set_task_completion_state', {
        p_expected_org_id: scope.orgId,
        p_task_id: taskId,
        p_actor_id: scope.actorId,
        p_is_workspace_manager: isWorkspaceManager(scope.role),
        p_action: 'reopen',
      });
      if (error) throwMutationError(error, 'Not authorized to reopen this task');
      const result = data as TaskMutationResult;
      return { task: result.task, idempotent: result.idempotent === true };
    },
  };
}
