import type { ToolResult } from '@/lib/ai/types';
import { grantByHolding, type DB } from './grants';
import type { AssistantToolArguments } from '../executor-types';

type TemplateStep = {
  id?: string;
  name?: string;
  description?: string;
  required?: boolean;
  estimated_days?: number;
  order?: number;
};

function normalizeStep(step: TemplateStep, index: number) {
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

function stepDueAt(
  startedAt: Date,
  workflowDueAt: string | null,
  cumulativeDays: number,
) {
  if (workflowDueAt && cumulativeDays === 0) return workflowDueAt;
  const due = new Date(startedAt);
  due.setDate(due.getDate() + cumulativeDays);
  return due.toISOString();
}

export async function startDueDiligence(
  supabase: DB,
  args: AssistantToolArguments,
  portfolioId: string,
  userId: string,
): Promise<ToolResult> {
  const { holding_id, template_id, due_date, assigned_to } = args;

  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);

  // Find template — use provided or find the first due-diligence template for this org
  let templateQuery = supabase
    .from('workflow_templates')
    .select('id, name, workflow_type, steps')
    .eq('is_active', true)
    .or(`org_id.is.null,org_id.eq.${grant.org_id}`);

  templateQuery = template_id
    ? templateQuery.eq('id', template_id)
    : templateQuery.eq('workflow_type', 'due_diligence').limit(1);

  const { data: template, error: templateError } =
    await templateQuery.maybeSingle();
  if (templateError) throw new Error(templateError.message);
  if (!template) throw new Error('Due diligence workflow template not found');

  const startedAt = new Date();
  const dueAt = due_date
    ? new Date(`${due_date}T12:00:00Z`).toISOString()
    : null;
  const grantName = grant.holdings?.name || 'Grant';

  const { data: instance, error } = await supabase
    .from('workflow_instances')
    .insert({
      org_id: grant.org_id,
      portfolio_id: portfolioId,
      template_id: template.id,
      grant_id: grant.id,
      name: `${template.name || 'Due Diligence'} - ${grantName}`,
      workflow_type: template.workflow_type || 'due_diligence',
      status: 'active',
      due_date: due_date ?? null,
      due_at: dueAt,
      started_at: startedAt.toISOString(),
      created_by: userId,
      metadata: {
        created_by_ai: true,
        holding_id,
      },
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const steps = (Array.isArray(template.steps) ? template.steps : [])
    .map(normalizeStep)
    .sort((a: any, b: any) => a.sequence_order - b.sequence_order);

  let cumulativeDays = 0;
  const taskRows = steps.map((step: any) => {
    cumulativeDays += step.estimated_days;
    return {
      id: crypto.randomUUID(),
      org_id: grant.org_id,
      portfolio_id: portfolioId,
      title: step.name,
      description: step.description,
      status: 'open',
      priority: step.is_required ? 'normal' : 'low',
      task_type: 'checklist_step',
      source: 'ai',
      source_key: `ai_workflow:${instance.id}:${step.step_id}`,
      due_at: stepDueAt(startedAt, dueAt, cumulativeDays),
      assigned_to: assigned_to ?? null,
      created_by: userId,
      metadata: {
        workflow_id: instance.id,
        workflow_step_id: step.step_id,
        workflow_type: template.workflow_type,
      },
    };
  });

  if (taskRows.length > 0) {
    const { error: taskError } = await supabase.from('tasks').insert(taskRows);
    if (taskError) throw new Error(taskError.message);

    const { error: workflowTaskError } = await supabase
      .from('workflow_tasks')
      .insert(
        steps.map((step: any, index: number) => ({
          workflow_id: instance.id,
          task_id: taskRows[index].id,
          step_id: step.step_id,
          name: step.name,
          description: step.description,
          status: 'pending',
          is_required: step.is_required,
          sequence_order: step.sequence_order,
          due_date: taskRows[index].due_at.slice(0, 10),
        })),
      );
    if (workflowTaskError) throw new Error(workflowTaskError.message);

    const { error: linkError } = await supabase
      .from('task_entity_links')
      .insert(
        taskRows.flatMap((task: any) => [
          {
            task_id: task.id,
            org_id: grant.org_id,
            entity_type: 'workflow_instance',
            entity_id: instance.id,
            relationship: 'source',
          },
          {
            task_id: task.id,
            org_id: grant.org_id,
            entity_type: 'grant',
            entity_id: grant.id,
            relationship: 'primary',
          },
          {
            task_id: task.id,
            org_id: grant.org_id,
            entity_type: 'holding',
            entity_id: holding_id,
            relationship: 'context',
          },
        ]),
      );
    if (linkError) throw new Error(linkError.message);
  }

  return {
    action: null,
    output: {
      success: true,
      workflow_id: instance.id,
      grant_id: grant.id,
      tasks_created: taskRows.length,
      status: 'active',
      message: 'Due diligence workflow started.',
    },
  };
}

// ── get_workflow_status ──────────────────────────────────────────────────────

export async function getWorkflowStatus(
  supabase: DB,
  args: AssistantToolArguments,
  portfolioId: string,
): Promise<ToolResult> {
  const { holding_id, workflow_id, include_completed = false } = args;
  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);

  let query = supabase
    .from('workflow_instances')
    .select(
      `
      id, name, workflow_type, status, due_date, due_at, started_at, completed_at, notes, template_id,
      workflow_templates(name, workflow_type),
      workflow_tasks(id, task_id, step_id, name, description, status, is_required, sequence_order, due_date, completed_at, outcome, outcome_notes)
    `,
    )
    .eq('grant_id', grant.id);

  if (workflow_id) query = query.eq('id', workflow_id);
  if (!include_completed) query = query.neq('status', 'completed');

  const { data, error } = await query.order('started_at', { ascending: false });
  if (error) throw new Error(error.message);

  return {
    action: null,
    output: { workflows: data ?? [], count: (data ?? []).length },
  };
}

// ── complete_workflow_task ───────────────────────────────────────────────────

export async function completeWorkflowTask(
  supabase: DB,
  args: AssistantToolArguments,
  userId: string,
  portfolioId: string,
): Promise<ToolResult> {
  const { task_id, outcome, notes } = args;

  const { data: existing, error: loadError } = await supabase
    .from('workflow_tasks')
    .select(
      'id, workflow_id, task_id, status, workflow_instances!inner(org_id, portfolio_id)',
    )
    .or(`id.eq.${task_id},task_id.eq.${task_id}`)
    .eq('workflow_instances.portfolio_id', portfolioId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error(`Workflow task not found for ${task_id}`);

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('workflow_tasks')
    .update({
      status: 'completed',
      outcome,
      outcome_notes: notes ?? null,
      completed_at: completedAt,
      completed_by: userId,
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (existing.task_id) {
    const orgId = Array.isArray(existing.workflow_instances)
      ? existing.workflow_instances[0]?.org_id
      : existing.workflow_instances?.org_id;

    const { data: task } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: completedAt,
        completed_by: userId,
      })
      .eq('id', existing.task_id)
      .select()
      .maybeSingle();

    if (orgId) {
      await supabase.from('task_events').insert({
        task_id: existing.task_id,
        org_id: orgId,
        actor_id: userId,
        event_type: 'completed',
        before_values: existing,
        after_values: task ?? data,
      });
    }
  }

  const { data: remaining } = await supabase
    .from('workflow_tasks')
    .select('id')
    .eq('workflow_id', existing.workflow_id)
    .eq('is_required', true)
    .not('status', 'in', '(completed,skipped)')
    .limit(1);

  if ((remaining ?? []).length === 0) {
    await supabase
      .from('workflow_instances')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', existing.workflow_id);
  }

  return { action: null, output: { success: true, task: data } };
}
