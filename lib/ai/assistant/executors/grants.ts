// lib/ai/assistant/executors/grants.ts
//
// AI tool implementations for the grant_management module.
// Each function maps to one tool case in executeAssistantTool.
// All grant look-ups start from holding_id — grants.holding_id is UNIQUE.

import type { ToolResult } from '@/lib/ai/types';
import { createAdminClient } from '@/lib/supabase';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';

type DB = any; // supabase client

// ── schedule_reminder ────────────────────────────────────────────────────────

export async function scheduleReminder(supabase: DB, args: any, portfolioId: string): Promise<ToolResult> {
  const { title, description, due_date } = args;

  // Look up org_id from portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('org_id')
    .eq('id', portfolioId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      org_id: portfolio?.org_id ?? null,
      portfolio_id: portfolioId,
      title: title ?? 'Reminder',
      description: description ?? null,
      due_at: due_date,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { action: null, output: { success: true, reminder: data } };
}

async function grantByHolding(supabase: DB, holdingId: string, portfolioId: string) {
  const { data, error } = await supabase
    .from('grants')
    .select('id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount, approved_amount, currency, purpose, holdings(name)')
    .eq('holding_id', holdingId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function paymentCountsAgainstApprovedAmount(status: string | null | undefined): boolean {
  return !['cancelled', 'returned'].includes(status ?? 'scheduled');
}

async function assertGrantPaymentWithinApprovedAmount(
  supabase: DB,
  grant: any,
  proposed: { paymentId?: string | null; amount?: number | null; status?: string | null }
) {
  if (grant.approved_amount == null) return;

  const approvedAmount = Number(grant.approved_amount);
  const { data: payments, error } = await supabase
    .from('grant_payments')
    .select('id, amount, status')
    .eq('grant_id', grant.id);

  if (error) throw new Error(error.message);

  let total = 0;
  for (const payment of payments ?? []) {
    const isTargetPayment = proposed.paymentId && payment.id === proposed.paymentId;
    const nextStatus = isTargetPayment ? (proposed.status ?? payment.status) : payment.status;
    const nextAmount = isTargetPayment && proposed.amount != null ? Number(proposed.amount) : Number(payment.amount ?? 0);

    if (paymentCountsAgainstApprovedAmount(nextStatus)) {
      total += nextAmount;
    }
  }

  if (!proposed.paymentId && paymentCountsAgainstApprovedAmount(proposed.status)) {
    total += Number(proposed.amount ?? 0);
  }

  if (total > approvedAmount) {
    throw new Error(`Grant payments would exceed the approved amount of ${approvedAmount}.`);
  }
}

// ── get_grant_health ─────────────────────────────────────────────────────────

export async function getGrantHealth(supabase: DB, args: any): Promise<ToolResult> {
  const { portfolio_id, holding_id } = args;

  let query = supabase
    .from('v_grant_health')
    .select('*')
    .eq('portfolio_id', portfolio_id);

  if (holding_id) query = query.eq('holding_id', holding_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    return { action: null, output: { grants: [], message: 'No grants found for this portfolio.' } };
  }

  const summary = (data as any[]).map((g: any) => ({
    grant_id: g.grant_id,
    holding_id: g.holding_id,
    grantee: g.grantee_name,
    lifecycle_stage: g.lifecycle_stage,
    health_score: g.health_score,
    risk_level: g.risk_level,
    milestones: `${g.milestones_completed}/${g.total_milestones} (${g.milestones_overdue} overdue)`,
    reports: `${g.reports_submitted}/${g.total_reports} (${g.reports_overdue} overdue)`,
    total_disbursed: g.total_disbursed,
    payments_pending: g.payments_pending,
    active_workflows: g.active_workflows,
  }));

  return { action: null, output: { grants: summary, count: summary.length } };
}

// ── get_upcoming_deadlines ───────────────────────────────────────────────────

export async function getUpcomingDeadlines(supabase: DB, args: any): Promise<ToolResult> {
  const { portfolio_id, days_ahead = 30 } = args;

  const { data, error } = await supabase
    .rpc('get_upcoming_deadlines', { p_portfolio_id: portfolio_id, p_days_ahead: days_ahead });

  if (error) throw new Error(error.message);

  return {
    action: null,
    output: {
      deadlines: data ?? [],
      count: (data ?? []).length,
      days_ahead,
    },
  };
}

// ── log_grant_communication ──────────────────────────────────────────────────

export async function logGrantCommunication(supabase: DB, args: any, userId: string, portfolioId: string): Promise<ToolResult> {
  const { holding_id, direction, comm_type, subject, summary, contact_name, follow_up_required, follow_up_date } = args;

  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);

  const occurred_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('grant_communications')
    .insert({
      grant_id: grant.id,
      direction,
      comm_type,
      subject: subject ?? null,
      summary,
      contact_name: contact_name ?? null,
      occurred_at,
      follow_up_required: follow_up_required ?? false,
      follow_up_date: follow_up_date ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    action: null,
    output: {
      success: true,
      communication_id: data.id,
      grant_id: grant.id,
      direction,
      comm_type,
      occurred_at,
    },
  };
}

// ── record_grant_payment ─────────────────────────────────────────────────────

export async function recordGrantPayment(supabase: DB, args: any, portfolioId: string, userId: string): Promise<ToolResult> {
  const { holding_id, payment_id, amount, scheduled_date, actual_date, status, payment_method, notes } = args;

  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);

  if (payment_id) {
    await assertGrantPaymentWithinApprovedAmount(supabase, grant, {
      paymentId: payment_id,
      amount: amount != null ? Number(amount) : null,
      status: status ?? null,
    });

    // Update existing payment
    const { data, error } = await supabase
      .from('grant_payments')
      .update({
        ...(amount != null ? { amount } : {}),
        ...(scheduled_date ? { scheduled_date } : {}),
        ...(actual_date ? { paid_date: actual_date } : {}),
        ...(status ? { status } : {}),
        ...(payment_method ? { payment_method } : {}),
        ...(notes != null ? { notes } : {}),
        ...(actual_date ? { conditions_met: true } : {}),
      })
      .eq('id', payment_id)
      .eq('grant_id', grant.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await writeOrgAuditEvent(createAdminClient(), {
      orgId: grant.org_id,
      actorId: userId,
      action: ORG_AUDIT_ACTIONS.GRANT_PAYMENT_RECORDED,
      targetId: grant.id,
      metadata: {
        payment_id: data.id,
        operation: 'update',
        amount: data.amount,
        status: data.status,
        scheduled_date: data.scheduled_date,
        paid_date: data.paid_date,
      },
    });
    return { action: null, output: { success: true, payment: data } };
  }

  // Insert new payment
  const { data: countData } = await supabase
    .from('grant_payments')
    .select('payment_number')
    .eq('grant_id', grant.id)
    .order('payment_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payment_number = (countData?.payment_number ?? 0) + 1;

  await assertGrantPaymentWithinApprovedAmount(supabase, grant, {
    amount: amount != null ? Number(amount) : null,
    status: status ?? 'scheduled',
  });

  const { data, error } = await supabase
    .from('grant_payments')
    .insert({
      grant_id: grant.id,
      payment_number,
      amount: amount ?? null,
      scheduled_date: scheduled_date ?? null,
      paid_date: actual_date ?? null,
      status: status ?? 'scheduled',
      payment_method: payment_method ?? null,
      notes: notes ?? null,
      conditions_met: actual_date ? true : false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await writeOrgAuditEvent(createAdminClient(), {
    orgId: grant.org_id,
    actorId: userId,
    action: ORG_AUDIT_ACTIONS.GRANT_PAYMENT_RECORDED,
    targetId: grant.id,
    metadata: {
      payment_id: data.id,
      operation: 'insert',
      amount: data.amount,
      status: data.status,
      scheduled_date: data.scheduled_date,
      paid_date: data.paid_date,
    },
  });

  return { action: null, output: { success: true, payment: data, grant_id: grant.id } };
}

// ── track_milestone ──────────────────────────────────────────────────────────

export async function trackMilestone(supabase: DB, args: any, portfolioId: string): Promise<ToolResult> {
  const { holding_id, milestone_id, name, description, due_date, status, notes } = args;

  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);
  if (status === 'overdue') {
    throw new Error('Milestone overdue state is computed from due_date; use pending or in_progress as the stored status.');
  }

  if (milestone_id) {
    // Update existing
    const { data, error } = await supabase
      .from('grant_milestones')
      .update({
        ...(name ? { milestone_name: name } : {}),
        ...(description != null ? { description } : {}),
        ...(due_date ? { due_date } : {}),
        ...(status ? { status } : {}),
        ...(notes != null ? { notes } : {}),
        ...(status === 'completed' ? { completed_date: new Date().toISOString().slice(0, 10) } : {}),
      })
      .eq('id', milestone_id)
      .eq('grant_id', grant.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { action: null, output: { success: true, milestone: data } };
  }

  // Create new
  const { data, error } = await supabase
    .from('grant_milestones')
    .insert({
      grant_id: grant.id,
      milestone_name: name ?? 'Milestone',
      description: description ?? null,
      due_date: due_date ?? null,
      status: status ?? 'pending',
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { action: null, output: { success: true, milestone: data, grant_id: grant.id } };
}

// ── start_due_diligence ──────────────────────────────────────────────────────

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
    estimated_days: Number.isFinite(step.estimated_days) ? Math.max(Number(step.estimated_days), 0) : 0,
  };
}

function stepDueAt(startedAt: Date, workflowDueAt: string | null, cumulativeDays: number) {
  if (workflowDueAt && cumulativeDays === 0) return workflowDueAt;
  const due = new Date(startedAt);
  due.setDate(due.getDate() + cumulativeDays);
  return due.toISOString();
}

export async function startDueDiligence(supabase: DB, args: any, portfolioId: string, userId: string): Promise<ToolResult> {
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

  const { data: template, error: templateError } = await templateQuery.maybeSingle();
  if (templateError) throw new Error(templateError.message);
  if (!template) throw new Error('Due diligence workflow template not found');

  const startedAt = new Date();
  const dueAt = due_date ? new Date(`${due_date}T12:00:00Z`).toISOString() : null;
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

    const { error: workflowTaskError } = await supabase.from('workflow_tasks').insert(
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
      }))
    );
    if (workflowTaskError) throw new Error(workflowTaskError.message);

    const { error: linkError } = await supabase.from('task_entity_links').insert(
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
      ])
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

export async function getWorkflowStatus(supabase: DB, args: any, portfolioId: string): Promise<ToolResult> {
  const { holding_id, workflow_id, include_completed = false } = args;
  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);

  let query = supabase
    .from('workflow_instances')
    .select(`
      id, name, workflow_type, status, due_date, due_at, started_at, completed_at, notes, template_id,
      workflow_templates(name, workflow_type),
      workflow_tasks(id, task_id, step_id, name, description, status, is_required, sequence_order, due_date, completed_at, outcome, outcome_notes)
    `)
    .eq('grant_id', grant.id);

  if (workflow_id) query = query.eq('id', workflow_id);
  if (!include_completed) query = query.neq('status', 'completed');

  const { data, error } = await query.order('started_at', { ascending: false });
  if (error) throw new Error(error.message);

  return { action: null, output: { workflows: data ?? [], count: (data ?? []).length } };
}

// ── complete_workflow_task ───────────────────────────────────────────────────

export async function completeWorkflowTask(supabase: DB, args: any, userId: string, portfolioId: string): Promise<ToolResult> {
  const { task_id, outcome, notes } = args;

  const { data: existing, error: loadError } = await supabase
    .from('workflow_tasks')
    .select('id, workflow_id, task_id, status, workflow_instances!inner(org_id, portfolio_id)')
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
