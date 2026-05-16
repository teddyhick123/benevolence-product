// lib/tasks/automation/producers/grants.ts
//
// Produces tasks for grant obligations:
//   1. grant_milestones — upcoming and overdue milestones
//   2. grant_reports    — reports due soon that haven't been submitted/received
//   3. grant_payments   — payments where conditions haven't been met yet
//
// CRITICAL: grant_milestones, grant_reports, and grant_payments have NO org_id column.
// They are scoped to org via: grant_details → holdings.org_id
// The Supabase PostgREST join syntax `grant_details!inner(holdings!inner(org_id))`
// is used in select() and then filtered client-side by org_id after the query.
// Since admin client bypasses RLS, we filter org_id via the joined holdings path.
//
// Source key formats:
//   Milestone upcoming:         grant_milestone:{id}:upcoming
//   Milestone overdue:          grant_milestone:{id}:overdue
//   Report due:                 grant_report:{id}:due_soon
//   Payment conditions pending: grant_payment:{id}:conditions_pending
//
// Prefix for closing all tasks for a milestone: grant_milestone:{id}:
// Prefix for closing all tasks for a report:    grant_report:{id}:
// Prefix for closing all tasks for a payment:   grant_payment:{id}:

import { createAdminClient } from '@/lib/supabase';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask, completeGeneratedTasks } from '../task-writer';

const PRODUCER_ID = 'grant_obligations';

// Milestone: generate tasks when due within this window
const MILESTONE_REMINDER_DAYS = 30;
// Milestone: high priority when within this many days
const MILESTONE_HIGH_PRIORITY_DAYS = 14;

// Grant reports: generate tasks when due within this window
const REPORT_REMINDER_DAYS = 45;
// Grant reports: high priority when within this many days
const REPORT_HIGH_PRIORITY_DAYS = 14;

// Statuses considered "not done" for milestones
const MILESTONE_OPEN_STATUSES = ['pending', 'in_progress', 'overdue'];

export async function grantObligationsProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  const { orgId, dryRun = false, now: nowOverride } = options;

  // Require an orgId — this producer is always org-scoped
  if (!orgId) return [];

  const now = nowOverride ?? new Date();
  const today = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const generatedAt = now.toISOString();

  const db = createAdminClient();

  const result: TaskProducerResult = {
    producer: PRODUCER_ID,
    orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  // -------------------------------------------------------------------------
  // 1. Grant milestones
  //
  // Scope to org via grant_details → holdings.org_id.
  // Filter to milestones with due_date within 30 days (or already overdue)
  // and status NOT in terminal set.
  // -------------------------------------------------------------------------

  const milestoneHorizon = new Date(now);
  milestoneHorizon.setDate(milestoneHorizon.getDate() + MILESTONE_REMINDER_DAYS);
  const milestoneHorizonStr = milestoneHorizon.toISOString().slice(0, 10);

  const { data: milestones, error: milestonesError } = await (db
    .from('grant_milestones')
    .select(
      'id, grant_id, milestone_name, description, due_date, status, grant_details!inner(holding_id, holdings!inner(org_id, portfolio_id, name))'
    )
    .in('status', MILESTONE_OPEN_STATUSES)
    .not('due_date', 'is', null)
    .lte('due_date', milestoneHorizonStr) as any);

  if (milestonesError) {
    result.errors.push({
      sourceType: 'grant_milestones',
      sourceId: orgId,
      message: (milestonesError as any).message,
    });
    // Continue to reports/payments
  }

  // Filter client-side to org (admin client bypasses RLS; the join brings org_id into scope)
  const orgMilestones = (milestones ?? []).filter((m: any) => {
    const holding = m.grant_details?.holdings;
    return holding?.org_id === orgId;
  });

  result.scanned += orgMilestones.length;

  for (const milestone of orgMilestones) {
    const milestoneId = milestone.id as string;
    const grantId = milestone.grant_id as string;
    const milestoneName = (milestone.milestone_name as string) ?? 'Grant milestone';
    const description = (milestone.description as string | null) ?? '';
    const dueDate = milestone.due_date as string;
    const status = milestone.status as string;
    const holding = (milestone as any).grant_details?.holdings ?? {};
    const portfolioId = (holding.portfolio_id as string | null) ?? null;
    const grantName = (holding.name as string | null) ?? 'grant';

    const dueDateMs = new Date(dueDate).getTime();
    const nowMs = now.getTime();
    const diffMs = dueDateMs - nowMs;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isOverdue = dueDate < today;

    try {
      if (isOverdue) {
        // Complete the upcoming task if it exists, then upsert an overdue task
        if (!dryRun) {
          const completed = await completeGeneratedTasks(
            db,
            orgId,
            `grant_milestone:${milestoneId}:`,
            'Milestone is now overdue'
          );
          result.completed += completed;
        }

        const daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));

        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId,
          sourceKey: `grant_milestone:${milestoneId}:overdue`,
          title: `Overdue milestone — ${milestoneName}`,
          description:
            `Grant milestone "${milestoneName}" for ${grantName} was due on ${dueDate}` +
            ` and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.` +
            (description ? ` Details: ${description}` : '') +
            ` Update the milestone status or complete it as soon as possible.`,
          taskType: 'reminder',
          priority: 'urgent',
          dueAt: dueDate,
          assignedTo: null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'overdue',
            source_status: status,
            escalation_state: 'overdue',
            days_overdue: daysOverdue,
            grant_id: grantId,
            generated_at: generatedAt,
          },
          links: [
            { entityType: 'grant_milestone', entityId: milestoneId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ],
          reopenResolved: false,
        };

        if (!dryRun) {
          const upsertResult = await upsertGeneratedTask(db, task);
          if (upsertResult === 'created') result.created++;
          else if (upsertResult === 'updated') result.updated++;
          else result.skipped++;
        }
      } else {
        const daysUntilDue = Math.ceil(diffDays);

        let priority: UpsertGeneratedTaskInput['priority'];
        let escalationState: string;

        if (daysUntilDue <= MILESTONE_HIGH_PRIORITY_DAYS) {
          priority = 'high';
          escalationState = 'approaching';
        } else {
          priority = 'normal';
          escalationState = 'upcoming';
        }

        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId,
          sourceKey: `grant_milestone:${milestoneId}:upcoming`,
          title: `Grant milestone due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${milestoneName}`,
          description:
            `Grant milestone "${milestoneName}" for ${grantName} is due on ${dueDate}` +
            ` (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
            (description ? ` Details: ${description}` : '') +
            ` Complete or update this milestone before the deadline.`,
          taskType: 'reminder',
          priority,
          dueAt: dueDate,
          assignedTo: null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'upcoming_milestone',
            source_status: status,
            escalation_state: escalationState,
            days_until_due: daysUntilDue,
            grant_id: grantId,
            generated_at: generatedAt,
          },
          links: [
            { entityType: 'grant_milestone', entityId: milestoneId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ],
          reopenResolved: false,
        };

        if (!dryRun) {
          const upsertResult = await upsertGeneratedTask(db, task);
          if (upsertResult === 'created') result.created++;
          else if (upsertResult === 'updated') result.updated++;
          else result.skipped++;
        }
      }
    } catch (err: any) {
      result.errors.push({
        sourceType: 'grant_milestones',
        sourceId: milestoneId,
        message: err?.message ?? String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Grant reports
  //
  // Scope to org via grant_details → holdings.org_id.
  // Filter: submitted_date IS NULL AND received_at IS NULL AND due_date within 45 days.
  // -------------------------------------------------------------------------

  const reportHorizon = new Date(now);
  reportHorizon.setDate(reportHorizon.getDate() + REPORT_REMINDER_DAYS);
  const reportHorizonStr = reportHorizon.toISOString().slice(0, 10);

  const { data: reports, error: reportsError } = await (db
    .from('grant_reports')
    .select(
      'id, grant_id, report_type, due_date, submitted_date, received_at, grant_details!inner(holding_id, holdings!inner(org_id, portfolio_id, name))'
    )
    .is('submitted_date', null)
    .is('received_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', reportHorizonStr) as any);

  if (reportsError) {
    result.errors.push({
      sourceType: 'grant_reports',
      sourceId: orgId,
      message: (reportsError as any).message,
    });
  }

  const orgReports = (reports ?? []).filter((r: any) => {
    const holding = r.grant_details?.holdings;
    return holding?.org_id === orgId;
  });

  result.scanned += orgReports.length;

  for (const report of orgReports) {
    const reportId = report.id as string;
    const grantId = report.grant_id as string;
    const reportType = ((report.report_type as string | null) ?? 'report').replace(/_/g, ' ');
    const dueDate = report.due_date as string;
    const holding = (report as any).grant_details?.holdings ?? {};
    const portfolioId = (holding.portfolio_id as string | null) ?? null;
    const grantName = (holding.name as string | null) ?? 'grant';

    const dueDateMs = new Date(dueDate).getTime();
    const nowMs = now.getTime();
    const diffMs = dueDateMs - nowMs;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isOverdue = dueDate < today;
    const daysUntilDue = Math.ceil(diffDays);
    const daysOverdue = isOverdue ? Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24)) : 0;

    try {
      let priority: UpsertGeneratedTaskInput['priority'];
      let escalationState: string;
      let title: string;
      let description: string;

      if (isOverdue) {
        priority = 'urgent';
        escalationState = 'overdue';
        title = `Overdue grant report — ${grantName}`;
        description =
          `A ${reportType} for ${grantName} was due on ${dueDate}` +
          ` and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.` +
          ` Submit the report or update its status immediately.`;
      } else if (daysUntilDue <= REPORT_HIGH_PRIORITY_DAYS) {
        priority = 'high';
        escalationState = 'approaching';
        title = `Grant report due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${grantName}`;
        description =
          `A ${reportType} for ${grantName} is due on ${dueDate}` +
          ` (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
          ` Prepare and submit this report on time.`;
      } else {
        priority = 'normal';
        escalationState = 'upcoming';
        title = `Grant report due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${grantName}`;
        description =
          `A ${reportType} for ${grantName} is due on ${dueDate}` +
          ` (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
          ` Begin preparing this report to meet the deadline.`;
      }

      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_report:${reportId}:due_soon`,
        title,
        description,
        taskType: 'review',
        priority,
        dueAt: dueDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: isOverdue ? 'report_overdue' : 'report_due_soon',
          source_status: 'pending',
          escalation_state: escalationState,
          ...(isOverdue ? { days_overdue: daysOverdue } : { days_until_due: daysUntilDue }),
          grant_id: grantId,
          report_type: report.report_type,
          generated_at: generatedAt,
        },
        links: [
          { entityType: 'grant_report', entityId: reportId, relationship: 'primary' },
          { entityType: 'grant', entityId: grantId, relationship: 'context' },
        ],
        reopenResolved: false,
      };

      if (!dryRun) {
        const upsertResult = await upsertGeneratedTask(db, task);
        if (upsertResult === 'created') result.created++;
        else if (upsertResult === 'updated') result.updated++;
        else result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({
        sourceType: 'grant_reports',
        sourceId: reportId,
        message: err?.message ?? String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Grant payments — conditions not yet met, payment not yet made
  //
  // Scope to org via grant_details → holdings.org_id.
  // No date window — any payment in this state generates a task.
  // Use paid_date IS NULL (actual payment field; payment_date does not exist in schema).
  // -------------------------------------------------------------------------

  const { data: payments, error: paymentsError } = await (db
    .from('grant_payments')
    .select(
      'id, grant_id, payment_number, amount, conditions_met, paid_date, scheduled_date, status, grant_details!inner(holding_id, holdings!inner(org_id, portfolio_id, name))'
    )
    .is('paid_date', null)
    .eq('conditions_met', false) as any);

  if (paymentsError) {
    result.errors.push({
      sourceType: 'grant_payments',
      sourceId: orgId,
      message: (paymentsError as any).message,
    });
  }

  // Filter client-side: org scoping + conditions_met = false
  const orgPayments = (payments ?? []).filter((p: any) => {
    const holding = p.grant_details?.holdings;
    return holding?.org_id === orgId && p.conditions_met === false;
  });

  result.scanned += orgPayments.length;

  for (const payment of orgPayments) {
    const paymentId = payment.id as string;
    const grantId = payment.grant_id as string;
    const paymentNumber = payment.payment_number as number;
    const amount = payment.amount as number | null;
    const scheduledDate = (payment.scheduled_date as string | null) ?? null;
    const status = payment.status as string;
    const holding = (payment as any).grant_details?.holdings ?? {};
    const portfolioId = (holding.portfolio_id as string | null) ?? null;
    const grantName = (holding.name as string | null) ?? 'grant';

    const amountStr = amount != null
      ? ` ($${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
      : '';

    try {
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_payment:${paymentId}:conditions_pending`,
        title: `Grant payment #${paymentNumber} awaiting conditions — ${grantName}`,
        description:
          `Payment #${paymentNumber}${amountStr} for ${grantName} cannot be disbursed because` +
          ` its conditions have not yet been marked as met.` +
          (scheduledDate ? ` This payment is scheduled for ${scheduledDate}.` : '') +
          ` Review and confirm all disbursement conditions, then update the payment record.`,
        taskType: 'checklist_step',
        priority: 'normal',
        dueAt: scheduledDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: 'payment_conditions_pending',
          source_status: status,
          escalation_state: 'pending',
          payment_number: paymentNumber,
          grant_id: grantId,
          generated_at: generatedAt,
        },
        links: [
          { entityType: 'grant_payment', entityId: paymentId, relationship: 'primary' },
          { entityType: 'grant', entityId: grantId, relationship: 'context' },
        ],
        reopenResolved: false,
      };

      if (!dryRun) {
        const upsertResult = await upsertGeneratedTask(db, task);
        if (upsertResult === 'created') result.created++;
        else if (upsertResult === 'updated') result.updated++;
        else result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({
        sourceType: 'grant_payments',
        sourceId: paymentId,
        message: err?.message ?? String(err),
      });
    }
  }

  // Only return a result if we actually had entries to scan or errors
  if (result.scanned === 0 && result.errors.length === 0) {
    return [];
  }

  return [result];
}
