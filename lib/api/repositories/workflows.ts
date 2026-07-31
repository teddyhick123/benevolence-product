import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { StartWorkflowInput, UpdateWorkflowTaskInput } from '@/lib/schemas/workflow';
import { isWorkspaceManager } from '@/lib/roles';

type WorkflowRepositoryScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

type TemplateStep = {
  id?: string;
  name?: string;
  description?: string;
  required?: boolean;
  estimated_days?: number;
  order?: number;
};

type NormalizedStep = {
  step_id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  sequence_order: number;
  estimated_days: number;
};

type WorkflowTaskRow = {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  source: string;
  source_key: string;
  due_at: string;
  assigned_to: string | null;
  created_by: string;
  metadata: Record<string, unknown>;
};

export class WorkflowStartInputError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = 'WorkflowStartInputError';
    this.status = status;
  }
}

function normalizeStep(step: TemplateStep, index: number): NormalizedStep {
  const sequence = Number.isFinite(step.order) ? Number(step.order) : index + 1;
  return {
    step_id: step.id || `step_${sequence}`,
    name: step.name || `Step ${sequence}`,
    description: step.description || null,
    is_required: step.required !== false,
    sequence_order: sequence,
    estimated_days: Number.isFinite(step.estimated_days)
      ? Math.max(Number(step.estimated_days), 0)
      : 0,
  };
}

function stepDueAt(startedAt: Date, workflowDueAt: string | null, cumulativeDays: number) {
  if (workflowDueAt && cumulativeDays === 0) return workflowDueAt;
  const due = new Date(startedAt);
  due.setDate(due.getDate() + cumulativeDays);
  return due.toISOString();
}

/** Elevated workflow creation constrained to one authorized org and actor. */
export function createWorkflowRepository(scope: WorkflowRepositoryScope) {
  const db = createElevatedClient();

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
      .not('accepted_at', 'is', null)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async function loadGrantContext(input: StartWorkflowInput) {
    let holding: any = null;
    let grantId = input.grant_id || null;

    if (grantId) {
      const { data: grant, error } = await db
        .from('grants')
        .select('id, holding_id')
        .eq('id', grantId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      if (!grant) throw new WorkflowStartInputError('Grant not found', 400);

      const { data: grantHolding, error: holdingError } = await db
        .from('holdings')
        .select('id, name, portfolio_id, org_id')
        .eq('id', grant.holding_id)
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .maybeSingle();
      if (holdingError) throw holdingError;
      if (!grantHolding) {
        throw new WorkflowStartInputError(
          'Grant does not belong to this organization',
          400
        );
      }
      holding = grantHolding;
    }

    if (!grantId && input.holding_id) {
      const { data: foundHolding, error } = await db
        .from('holdings')
        .select('id, name, portfolio_id, org_id')
        .eq('id', input.holding_id)
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!foundHolding) {
        throw new WorkflowStartInputError(
          'Holding does not belong to this organization',
          400
        );
      }
      holding = foundHolding;

      const { data: existingGrant, error: grantError } = await db
        .from('grants')
        .select('id')
        .eq('holding_id', input.holding_id)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (grantError) throw grantError;
      if (!existingGrant) {
        throw new WorkflowStartInputError(
          'Grant not found for this holding. Create the grant first.',
          400
        );
      }
      grantId = existingGrant.id;
    }

    const portfolioId = holding?.portfolio_id || input.portfolio_id || null;
    if (!(await assertPortfolio(portfolioId))) {
      throw new WorkflowStartInputError(
        'Portfolio does not belong to this organization',
        400
      );
    }
    return { grantId, holding, portfolioId };
  }

  async function loadWorkflow(workflowId: string) {
    const { data, error } = await db
      .from('workflow_instances')
      .select(`
        *,
        workflow_templates(name, workflow_type),
        workflow_tasks(*),
        grants(holding_id)
      `)
      .eq('id', workflowId)
      .eq('org_id', scope.orgId)
      .single();
    if (error) throw error;
    return data;
  }

  return {
    async startWorkflow(input: StartWorkflowInput) {
      const createdIds: { workflowId?: string; taskIds: string[] } = { taskIds: [] };

      try {
        if (!(await assertAssignee(input.assigned_to))) {
          throw new WorkflowStartInputError(
            'Assignee is not a member of this organization',
            400
          );
        }

        const { data: template, error: templateError } = await db
          .from('workflow_templates')
          .select('*')
          .eq('id', input.template_id)
          .eq('is_active', true)
          .or(`org_id.is.null,org_id.eq.${scope.orgId}`)
          .maybeSingle();
        if (templateError) throw templateError;
        if (!template) throw new WorkflowStartInputError('Workflow template not found', 404);

        const grantContext = await loadGrantContext(input);
        const startedAt = new Date();
        const dueAt = input.due_at
          || (input.due_date ? new Date(`${input.due_date}T12:00:00Z`).toISOString() : null);
        const workflowName = input.name
          || `${template.name}${grantContext.holding?.name ? ` - ${grantContext.holding.name}` : ''}`;

        const { data: workflow, error: workflowError } = await db
          .from('workflow_instances')
          .insert({
            org_id: scope.orgId,
            portfolio_id: grantContext.portfolioId,
            template_id: template.id,
            grant_id: grantContext.grantId,
            name: workflowName,
            workflow_type: template.workflow_type,
            status: 'active',
            due_date: input.due_date || null,
            due_at: dueAt,
            started_at: startedAt.toISOString(),
            created_by: scope.actorId,
            notes: input.notes || null,
            metadata: input.metadata || {},
          })
          .select()
          .single();
        if (workflowError) throw workflowError;
        createdIds.workflowId = workflow.id;

        const rawSteps: TemplateStep[] = Array.isArray(template.steps) ? template.steps : [];
        const steps = rawSteps.map(normalizeStep)
          .sort((a, b) => a.sequence_order - b.sequence_order);
        let cumulativeDays = 0;
        const taskRows: WorkflowTaskRow[] = steps.map(step => {
          cumulativeDays += step.estimated_days;
          const id = crypto.randomUUID();
          createdIds.taskIds.push(id);
          return {
            id,
            org_id: scope.orgId,
            portfolio_id: grantContext.portfolioId,
            title: step.name,
            description: step.description,
            status: 'open',
            priority: step.is_required ? 'normal' : 'low',
            task_type: 'checklist_step',
            source: 'template',
            source_key: `${workflow.id}:${step.step_id}`,
            due_at: stepDueAt(startedAt, dueAt, cumulativeDays),
            assigned_to: input.assigned_to || null,
            created_by: scope.actorId,
            metadata: {
              workflow_id: workflow.id,
              workflow_step_id: step.step_id,
              workflow_type: template.workflow_type,
            },
          };
        });

        if (taskRows.length > 0) {
          const { error: taskError } = await db.from('tasks').insert(taskRows);
          if (taskError) throw taskError;
          const { error: workflowTaskError } = await db.from('workflow_tasks').insert(
            steps.map((step, index) => ({
              workflow_id: workflow.id,
              task_id: taskRows[index].id,
              step_id: step.step_id,
              name: step.name,
              description: step.description,
              status: 'pending',
              is_required: step.is_required,
              sequence_order: step.sequence_order,
              due_date: taskRows[index].due_at.slice(0, 10),
            }))
          );
          if (workflowTaskError) throw workflowTaskError;

          const entityLinks = taskRows.flatMap(task => [
            {
              task_id: task.id,
              org_id: scope.orgId,
              entity_type: 'workflow_instance',
              entity_id: workflow.id,
              relationship: 'source',
            },
            ...(grantContext.grantId ? [{
              task_id: task.id,
              org_id: scope.orgId,
              entity_type: 'grant',
              entity_id: grantContext.grantId,
              relationship: 'primary',
            }] : []),
            ...(grantContext.holding?.id ? [{
              task_id: task.id,
              org_id: scope.orgId,
              entity_type: 'holding',
              entity_id: grantContext.holding.id,
              relationship: 'context',
            }] : []),
          ]);
          const { error: linkError } = await db.from('task_entity_links').insert(entityLinks);
          if (linkError) throw linkError;
          const { error: eventError } = await db.from('task_events').insert(
            taskRows.map(task => ({
              task_id: task.id,
              org_id: scope.orgId,
              actor_id: scope.actorId,
              event_type: 'created',
              after_values: task,
            }))
          );
          if (eventError) throw eventError;
        }

        return loadWorkflow(workflow.id);
      } catch (error) {
        if (createdIds.taskIds.length > 0) {
          await db.from('tasks').delete().in('id', createdIds.taskIds);
        }
        if (createdIds.workflowId) {
          await db
            .from('workflow_instances')
            .delete()
            .eq('id', createdIds.workflowId)
            .eq('org_id', scope.orgId);
        }
        throw error;
      }
    },
  };
}

type WorkflowTaskRepositoryScope = Pick<OrgAccessContext, 'orgId' | 'role'> & {
  actorId: string;
};

export class WorkflowTaskMutationError extends Error {
  readonly status: 403 | 404;

  constructor(message: string, status: 403 | 404) {
    super(message);
    this.name = 'WorkflowTaskMutationError';
    this.status = status;
  }
}

function taskStatusForWorkflowStatus(status?: string) {
  if (status === 'completed') return 'completed';
  if (status === 'skipped') return 'cancelled';
  if (status === 'blocked') return 'blocked';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

/** Elevated workflow-task synchronization constrained through its parent workflow org. */
export function createWorkflowTaskRepository(scope: WorkflowTaskRepositoryScope) {
  const db = createElevatedClient();

  async function maybeCompleteWorkflow(workflowId: string) {
    const { data: remaining, error: remainingError } = await db
      .from('workflow_tasks')
      .select('id')
      .eq('workflow_id', workflowId)
      .eq('is_required', true)
      .not('status', 'in', '(completed,skipped)')
      .limit(1);
    if (remainingError) throw remainingError;

    if ((remaining || []).length === 0) {
      const { error } = await db
        .from('workflow_instances')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', workflowId)
        .eq('org_id', scope.orgId);
      if (error) throw error;
    }
  }

  return {
    async updateWorkflowTask(input: {
      workflowId: string;
      workflowTaskId: string;
      updates: UpdateWorkflowTaskInput;
    }) {
      const { data: existing, error: loadError } = await db
        .from('workflow_tasks')
        .select('*, tasks(id, assigned_to, status, completed_at, completed_by), workflow_instances!inner(id, org_id, status, completed_at)')
        .eq('id', input.workflowTaskId)
        .eq('workflow_id', input.workflowId)
        .eq('workflow_instances.org_id', scope.orgId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!existing) throw new WorkflowTaskMutationError('Workflow task not found', 404);

      const linkedTask = Array.isArray(existing.tasks) ? existing.tasks[0] : existing.tasks;
      if (!isWorkspaceManager(scope.role) && linkedTask?.assigned_to !== scope.actorId) {
        throw new WorkflowTaskMutationError(
          'Not authorized to update this workflow task',
          403
        );
      }

      const updates: Record<string, any> = { ...input.updates };
      if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = scope.actorId;
      } else if (updates.status && updates.status !== 'completed') {
        updates.completed_at = null;
        updates.completed_by = null;
      }

      const { data: workflowTask, error: updateError } = await db
        .from('workflow_tasks')
        .update(updates)
        .eq('id', input.workflowTaskId)
        .eq('workflow_id', input.workflowId)
        .select()
        .single();
      if (updateError) throw updateError;

      try {
        if (workflowTask.task_id && updates.status) {
          const taskUpdates: Record<string, any> = {
            status: taskStatusForWorkflowStatus(updates.status),
          };
          if (updates.status === 'completed') {
            taskUpdates.completed_at = updates.completed_at;
            taskUpdates.completed_by = scope.actorId;
          } else {
            taskUpdates.completed_at = null;
            taskUpdates.completed_by = null;
          }

          const { data: task, error: taskUpdateError } = await db
            .from('tasks')
            .update(taskUpdates)
            .eq('id', workflowTask.task_id)
            .eq('org_id', scope.orgId)
            .select()
            .single();
          if (taskUpdateError) throw taskUpdateError;

          const { error: eventError } = await db.from('task_events').insert({
            task_id: workflowTask.task_id,
            org_id: scope.orgId,
            actor_id: scope.actorId,
            event_type: updates.status === 'completed' ? 'completed' : 'status_changed',
            before_values: linkedTask || null,
            after_values: task || null,
          });
          if (eventError) throw eventError;
        }

        if (updates.status === 'completed' || updates.status === 'skipped') {
          await maybeCompleteWorkflow(input.workflowId);
        }
      } catch (syncError) {
        await db
          .from('workflow_tasks')
          .update({
            status: existing.status,
            completed_at: existing.completed_at,
            completed_by: existing.completed_by,
            outcome: existing.outcome,
            outcome_notes: existing.outcome_notes,
          })
          .eq('id', input.workflowTaskId)
          .eq('workflow_id', input.workflowId);
        if (workflowTask.task_id && linkedTask) {
          await db
            .from('tasks')
            .update({
              status: linkedTask.status,
              completed_at: linkedTask.completed_at,
              completed_by: linkedTask.completed_by,
            })
            .eq('id', workflowTask.task_id)
            .eq('org_id', scope.orgId);
        }
        await db
          .from('workflow_instances')
          .update({
            status: existing.workflow_instances.status,
            completed_at: existing.workflow_instances.completed_at,
          })
          .eq('id', input.workflowId)
          .eq('org_id', scope.orgId);
        throw syncError;
      }

      return workflowTask;
    },
  };
}
