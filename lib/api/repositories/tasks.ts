import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { z } from 'zod';
import { createTaskSchema, updateTaskSchema } from '@/lib/schemas/task';
import { isWorkspaceManager } from '@/lib/roles';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';
import { TASK_ENTITY_TYPES } from '@/lib/tasks/automation/types';

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

const DIRECT_ORG_ENTITY_TABLES: Record<string, string> = {
  filing: 'compliance_filings',
  state_registration: 'state_registrations',
  pledge_installment: 'pledge_installments',
  pledge: 'pledges',
  donor: 'donors',
  grant: 'grants',
  holding: 'holdings',
  portfolio: 'portfolios',
  import_job: 'import_jobs',
  workflow_instance: 'workflow_instances',
};

const GRANT_CHILD_ENTITY_TABLES: Record<string, string> = {
  grant_milestone: 'grant_milestones',
  grant_report: 'grant_reports',
  grant_payment: 'grant_payments',
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

function editableFieldsForAssignee(input: Record<string, any>) {
  const allowed = new Set(['status', 'metadata']);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
}

function withCompletionFields(updates: Record<string, any>, actorId: string) {
  if (updates.status === 'completed') {
    return { ...updates, completed_at: new Date().toISOString(), completed_by: actorId };
  }
  if (updates.status && updates.status !== 'completed') {
    return { ...updates, completed_at: null, completed_by: null };
  }
  return updates;
}

function eventTypeForUpdates(updates: Record<string, any>) {
  if (updates.status === 'completed') return 'completed';
  if (updates.status === 'cancelled') return 'cancelled';
  if (updates.assigned_to) return 'assigned';
  if (updates.due_at || updates.starts_at) return 'due_date_changed';
  return 'status_changed';
}

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

  async function assertPortfolio(portfolioId: string | null | undefined) {
    if (!portfolioId) return true;
    const { data, error } = await db
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('org_id', scope.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async function assertAssignee(userId: string | null | undefined) {
    if (!userId) return true;
    const { data, error } = await db
      .from('organization_members')
      .select('id')
      .eq('org_id', scope.orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async function assertEntityLink(link: { entity_type: string; entity_id: string }) {
    if (!TASK_ENTITY_TYPES.includes(link.entity_type as any)) return false;

    const directTable = DIRECT_ORG_ENTITY_TABLES[link.entity_type];
    if (directTable) {
      const { data, error } = await db
        .from(directTable)
        .select('id')
        .eq('id', link.entity_id)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    }

    const grantChildTable = GRANT_CHILD_ENTITY_TABLES[link.entity_type];
    if (grantChildTable) {
      const { data, error } = await db
        .from(grantChildTable)
        .select('id, grants!inner(org_id)')
        .eq('id', link.entity_id)
        .eq('grants.org_id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    }

    return false;
  }

  async function rollbackCompletion(taskId: string, existing: any) {
    await db
      .from('tasks')
      .update({
        status: existing.status,
        completed_at: existing.completed_at,
        completed_by: existing.completed_by,
      })
      .eq('id', taskId)
      .eq('org_id', scope.orgId);
  }

  async function syncGrantMilestoneCompletion(
    taskId: string,
    taskMetadata: Record<string, unknown> | null
  ) {
    if (!taskMetadata || taskMetadata.producer !== 'grant_obligations') return;

    const { data: links } = await db
      .from('task_entity_links')
      .select('entity_id')
      .eq('org_id', scope.orgId)
      .eq('task_id', taskId)
      .eq('entity_type', 'grant_milestone');
    if (!links || links.length === 0) return;

    const milestoneId = links[0].entity_id as string;
    const { data: milestone, error: milestoneError } = await db
      .from('grant_milestones')
      .select('id, grants!inner(org_id)')
      .eq('id', milestoneId)
      .eq('grants.org_id', scope.orgId)
      .maybeSingle();
    if (milestoneError) throw milestoneError;
    if (!milestone) {
      throw new Error('Linked grant milestone was not found in this organization');
    }

    const { error } = await db
      .from('grant_milestones')
      .update({ status: 'completed', completed_date: new Date().toISOString().slice(0, 10) })
      .eq('id', milestoneId);
    if (error) throw error;
  }

  async function runCompletionAutomation(taskId: string, task: any) {
    try {
      await runAutomationRulesForEvent(db, {
        orgId: scope.orgId,
        triggerType: 'task_completed',
        entityType: 'task',
        entityId: taskId,
        payload: {
          task_type: task.task_type,
          assigned_to: task.assigned_to,
          actor_id: scope.actorId,
        },
      });
    } catch (automationError) {
      console.error('Task completion automation failed:', automationError);
    }
  }

  return {
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
      if (!(await assertPortfolio(input.portfolio_id))) {
        throw new TaskRepositoryError('Portfolio does not belong to this organization', 400);
      }
      if (!(await assertAssignee(input.assigned_to))) {
        throw new TaskRepositoryError('Assignee is not a member of this organization', 400);
      }

      const { entity_links: entityLinks = [], ...taskFields } = input;
      for (const link of entityLinks) {
        if (!(await assertEntityLink(link))) {
          throw new TaskRepositoryError(
            `Linked ${link.entity_type} does not belong to this organization`,
            400
          );
        }
      }

      const { data: task, error } = await db
        .from('tasks')
        .insert({ ...taskFields, org_id: scope.orgId, created_by: scope.actorId })
        .select()
        .single();
      if (error) throw error;

      if (entityLinks.length > 0) {
        const { error: linkError } = await db.from('task_entity_links').insert(
          entityLinks.map(link => ({
            task_id: task.id,
            org_id: scope.orgId,
            entity_type: link.entity_type,
            entity_id: link.entity_id,
            relationship: link.relationship || 'primary',
          }))
        );
        if (linkError) {
          await db.from('tasks').delete().eq('id', task.id).eq('org_id', scope.orgId);
          throw linkError;
        }
      }

      const { error: eventError } = await db.from('task_events').insert({
        task_id: task.id,
        org_id: scope.orgId,
        actor_id: scope.actorId,
        event_type: 'created',
        after_values: task,
      });
      if (eventError) {
        await db.from('tasks').delete().eq('id', task.id).eq('org_id', scope.orgId);
        throw eventError;
      }
      return task;
    },

    async update(taskId: string, input: UpdateTaskInput) {
      const existing = await loadTask(taskId);
      if (!existing) throw new TaskRepositoryError('Task not found', 404);

      const isManager = isWorkspaceManager(scope.role);
      if (!isManager && existing.assigned_to !== scope.actorId) {
        throw new TaskRepositoryError('Not authorized to update this task', 403);
      }

      let updates = input as Record<string, any>;
      if (!isManager) updates = editableFieldsForAssignee(updates);
      if (Object.keys(updates).length === 0) {
        throw new TaskRepositoryError('No valid fields to update', 400);
      }
      if (!(await assertPortfolio(updates.portfolio_id))) {
        throw new TaskRepositoryError('Portfolio does not belong to this organization', 400);
      }
      if (!(await assertAssignee(updates.assigned_to))) {
        throw new TaskRepositoryError('Assignee is not a member of this organization', 400);
      }
      updates = withCompletionFields(updates, scope.actorId);

      const { data: task, error } = await db
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('org_id', scope.orgId)
        .select()
        .single();
      if (error) throw error;

      const { error: eventError } = await db.from('task_events').insert({
        task_id: taskId,
        org_id: scope.orgId,
        actor_id: scope.actorId,
        event_type: eventTypeForUpdates(updates),
        before_values: existing,
        after_values: task,
      });
      if (eventError) {
        await db
          .from('tasks')
          .update({
            title: existing.title,
            description: existing.description,
            status: existing.status,
            priority: existing.priority,
            task_type: existing.task_type,
            portfolio_id: existing.portfolio_id,
            starts_at: existing.starts_at,
            due_at: existing.due_at,
            assigned_to: existing.assigned_to,
            metadata: existing.metadata,
            completed_at: existing.completed_at,
            completed_by: existing.completed_by,
          })
          .eq('id', taskId)
          .eq('org_id', scope.orgId);
        throw eventError;
      }

      if (updates.status === 'completed') await runCompletionAutomation(taskId, task);
      return task;
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
      const task = await loadTask(taskId, 'id');
      if (!task) throw new TaskRepositoryError('Task not found', 404);

      const { data: comment, error } = await db
        .from('task_comments')
        .insert({
          task_id: taskId,
          org_id: scope.orgId,
          author_id: scope.actorId,
          body,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: eventError } = await db.from('task_events').insert({
        task_id: taskId,
        org_id: scope.orgId,
        actor_id: scope.actorId,
        event_type: 'commented',
        after_values: comment,
      });
      if (eventError) {
        await db.from('task_comments').delete().eq('id', comment.id).eq('org_id', scope.orgId);
        throw eventError;
      }
      return comment;
    },

    async complete(taskId: string) {
      const existing = await loadTask(taskId);
      if (!existing) throw new TaskRepositoryError('Task not found', 404);
      if (!isWorkspaceManager(scope.role) && existing.assigned_to !== scope.actorId) {
        throw new TaskRepositoryError('Not authorized to complete this task', 403);
      }
      if (existing.status === 'completed') return { task: existing, idempotent: true };

      const { data: task, error } = await db
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: scope.actorId,
        })
        .eq('id', taskId)
        .eq('org_id', scope.orgId)
        .select()
        .single();
      if (error) throw error;

      try {
        await syncGrantMilestoneCompletion(
          taskId,
          (task?.metadata as Record<string, unknown> | null) ?? null
        );
      } catch (syncError) {
        await rollbackCompletion(taskId, existing);
        throw syncError;
      }

      const { error: eventError } = await db.from('task_events').insert({
        task_id: taskId,
        org_id: scope.orgId,
        actor_id: scope.actorId,
        event_type: 'completed',
        before_values: existing,
        after_values: task,
      });
      if (eventError) {
        await rollbackCompletion(taskId, existing);
        throw eventError;
      }

      await runCompletionAutomation(taskId, task);
      return { task, idempotent: false };
    },

    async reopen(taskId: string) {
      const existing = await loadTask(taskId);
      if (!existing) throw new TaskRepositoryError('Task not found', 404);
      if (!isWorkspaceManager(scope.role) && existing.assigned_to !== scope.actorId) {
        throw new TaskRepositoryError('Not authorized to reopen this task', 403);
      }
      if (existing.status === 'open') return { task: existing, idempotent: true };

      const { data: task, error } = await db
        .from('tasks')
        .update({ status: 'open', completed_at: null, completed_by: null })
        .eq('id', taskId)
        .eq('org_id', scope.orgId)
        .select()
        .single();
      if (error) throw error;

      const { error: eventError } = await db.from('task_events').insert({
        task_id: taskId,
        org_id: scope.orgId,
        actor_id: scope.actorId,
        event_type: 'status_changed',
        before_values: existing,
        after_values: task,
      });
      if (eventError) {
        await rollbackCompletion(taskId, existing);
        throw eventError;
      }
      return { task, idempotent: false };
    },
  };
}
