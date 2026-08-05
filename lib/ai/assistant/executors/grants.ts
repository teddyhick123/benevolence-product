// lib/ai/assistant/executors/grants.ts
//
// AI tool implementations for the grant_management module.
// Each function maps to one tool case in executeAssistantTool.
// All grant look-ups start from holding_id — grants.holding_id is UNIQUE.

import type { ToolResult } from '@/lib/ai/types';
import type { AssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';
import type { AssistantToolArguments } from '../executor-types';

export type DB = any; // supabase client

// ── schedule_reminder ────────────────────────────────────────────────────────

export async function scheduleReminder(
  supabase: DB,
  args: AssistantToolArguments,
  portfolioId: string,
): Promise<ToolResult> {
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

export async function grantByHolding(
  supabase: DB,
  holdingId: string,
  portfolioId: string,
) {
  const { data, error } = await supabase
    .from('grants')
    .select(
      'id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount, approved_amount, currency, purpose, holdings(name)',
    )
    .eq('holding_id', holdingId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function paymentCountsAgainstApprovedAmount(
  status: string | null | undefined,
): boolean {
  return !['cancelled', 'returned'].includes(status ?? 'scheduled');
}

async function assertGrantPaymentWithinApprovedAmount(
  supabase: DB,
  grant: any,
  proposed: {
    paymentId?: string | null;
    amount?: number | null;
    status?: string | null;
  },
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
    const isTargetPayment =
      proposed.paymentId && payment.id === proposed.paymentId;
    const nextStatus = isTargetPayment
      ? (proposed.status ?? payment.status)
      : payment.status;
    const nextAmount =
      isTargetPayment && proposed.amount != null
        ? Number(proposed.amount)
        : Number(payment.amount ?? 0);

    if (paymentCountsAgainstApprovedAmount(nextStatus)) {
      total += nextAmount;
    }
  }

  if (
    !proposed.paymentId &&
    paymentCountsAgainstApprovedAmount(proposed.status)
  ) {
    total += Number(proposed.amount ?? 0);
  }

  if (total > approvedAmount) {
    throw new Error(
      `Grant payments would exceed the approved amount of ${approvedAmount}.`,
    );
  }
}

// ── get_grant_health ─────────────────────────────────────────────────────────

export async function getGrantHealth(
  supabase: DB,
  args: AssistantToolArguments,
): Promise<ToolResult> {
  const { portfolio_id, holding_id } = args;

  let query = supabase
    .from('v_grant_health')
    .select('*')
    .eq('portfolio_id', portfolio_id);

  if (holding_id) query = query.eq('holding_id', holding_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    return {
      action: null,
      output: { grants: [], message: 'No grants found for this portfolio.' },
    };
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

export async function getUpcomingDeadlines(
  supabase: DB,
  args: AssistantToolArguments,
): Promise<ToolResult> {
  const { portfolio_id, days_ahead = 30 } = args;

  const { data, error } = await supabase.rpc('get_upcoming_deadlines', {
    p_portfolio_id: portfolio_id,
    p_days_ahead: days_ahead,
  });

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

export async function logGrantCommunication(
  supabase: DB,
  args: AssistantToolArguments,
  userId: string,
  portfolioId: string,
): Promise<ToolResult> {
  const {
    holding_id,
    direction,
    comm_type,
    subject,
    summary,
    contact_name,
    follow_up_required,
    follow_up_date,
  } = args;

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

export async function recordGrantPayment(
  supabase: DB,
  args: AssistantToolArguments,
  portfolioId: string,
  capabilities: AssistantToolCapabilities,
): Promise<ToolResult> {
  const {
    holding_id,
    payment_id,
    amount,
    scheduled_date,
    actual_date,
    status,
    payment_method,
    notes,
  } = args;

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
    await capabilities.recordGrantPaymentAudit({
      grantId: grant.id,
      paymentId: data.id,
      operation: 'update',
      amount: data.amount,
      status: data.status,
      scheduledDate: data.scheduled_date,
      paidDate: data.paid_date,
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

  await capabilities.recordGrantPaymentAudit({
    grantId: grant.id,
    paymentId: data.id,
    operation: 'insert',
    amount: data.amount,
    status: data.status,
    scheduledDate: data.scheduled_date,
    paidDate: data.paid_date,
  });

  return {
    action: null,
    output: { success: true, payment: data, grant_id: grant.id },
  };
}

// ── track_milestone ──────────────────────────────────────────────────────────

export async function trackMilestone(
  supabase: DB,
  args: AssistantToolArguments,
  portfolioId: string,
): Promise<ToolResult> {
  const {
    holding_id,
    milestone_id,
    name,
    description,
    due_date,
    status,
    notes,
  } = args;

  const grant = await grantByHolding(supabase, holding_id, portfolioId);
  if (!grant) throw new Error(`No grant found for holding ${holding_id}`);
  if (status === 'overdue') {
    throw new Error(
      'Milestone overdue state is computed from due_date; use pending or in_progress as the stored status.',
    );
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
        ...(status === 'completed'
          ? { completed_date: new Date().toISOString().slice(0, 10) }
          : {}),
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
  return {
    action: null,
    output: { success: true, milestone: data, grant_id: grant.id },
  };
}

// ── start_due_diligence ──────────────────────────────────────────────────────

export {
  startDueDiligence,
  getWorkflowStatus,
  completeWorkflowTask,
} from './grants-workflows';
