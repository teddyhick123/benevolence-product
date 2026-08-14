// lib/tasks/automation/producers/grants.ts
//
// Produces tasks for grant obligations:
//   1. grant_milestones — one task per milestone, updated in place as priority escalates
//   2. grant_reports    — reports due soon or overdue that haven't been submitted/received
//   3. grant_payments   — payments where conditions haven't been met yet
//
// Scope via grants.org_id (grants now carries org_id/portfolio_id directly).
// Admin client bypasses RLS; filter org_id client-side from joined grants row.
//
// Source key formats:
//   Milestone (one key, updated in place): grant_milestone:{id}:due
//   Report (one key, updated in place):    grant_report:{id}:due
//   Payment conditions:                    grant_payment:{id}:conditions
//
// Prefix for closing all tasks for a milestone: grant_milestone:{id}:
// Prefix for closing all tasks for a report:    grant_report:{id}:
// Prefix for closing all tasks for a payment:   grant_payment:{id}:

import { createElevatedClient } from '@/lib/api/admin-client';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask } from '../task-writer';

const PRODUCER_ID = 'grant_obligations';

const MILESTONE_REMINDER_DAYS = 30;
const MILESTONE_HIGH_PRIORITY_DAYS = 14;

const REPORT_REMINDER_DAYS = 45;
const REPORT_HIGH_PRIORITY_DAYS = 15; // spec: 1-15 days = high

const PAYMENT_REMINDER_DAYS = 14; // spec: scheduled within 14 days or overdue

const MILESTONE_OPEN_STATUSES = ['pending', 'in_progress'];

export async function grantObligationsProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  const { orgId, dryRun = false, now: nowOverride } = options;

  // Require an orgId — this producer is always org-scoped
  if (!orgId) return [];

  const now = nowOverride ?? new Date();
  const today = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const generatedAt = now.toISOString();

  const db = createElevatedClient();

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
  // Scope to org via grants.org_id (grants carries org_id directly).
  // Filter to milestones with due_date within 30 days (or already overdue)
  // and status NOT in terminal set.
  // -------------------------------------------------------------------------

  const milestoneHorizon = new Date(now);
  milestoneHorizon.setDate(milestoneHorizon.getDate() + MILESTONE_REMINDER_DAYS);
  const milestoneHorizonStr = milestoneHorizon.toISOString().slice(0, 10);

  const { data: milestones, error: milestonesError } = await (db
    .from('grant_milestones')
    .select(
      'id, grant_id, milestone_name, description, due_date, status, grants!inner(org_id, portfolio_id, holding_id, holdings!inner(name))'
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

  // Filter client-side to org (admin client bypasses RLS; grants.org_id is in scope)
  const orgMilestones = (milestones ?? []).filter((m: any) => {
    return m.grants?.org_id === orgId;
  });

  result.scanned += orgMilestones.length;

  for (const milestone of orgMilestones) {
    const milestoneId = milestone.id as string;
    const grantId = milestone.grant_id as string;
    const milestoneName = (milestone.milestone_name as string) ?? 'Grant milestone';
    const milestoneDesc = (milestone.description as string | null) ?? '';
    const dueDate = milestone.due_date as string;
    const status = milestone.status as string;
    const grantRecord = (milestone as any).grants ?? {};
    const portfolioId = (grantRecord.portfolio_id as string | null) ?? null;
    const holdingId = (grantRecord.holding_id as string | null) ?? null;
    const grantName = (grantRecord.holdings?.name as string | null) ?? 'grant';

    const dueDateMs = new Date(dueDate).getTime();
    const nowMs = now.getTime();
    const diffDays = (dueDateMs - nowMs) / (1000 * 60 * 60 * 24);
    const isOverdue = dueDate < today;

    let daysOverdue = 0;
    let daysUntilDue = 0;

    try {
      let priority: UpsertGeneratedTaskInput['priority'];
      let escalationState: string;
      let taskTitle: string;
      let taskDescription: string;

      if (isOverdue) {
        daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));
        priority = 'urgent';
        escalationState = daysOverdue >= 30 ? 'overdue_30' : daysOverdue >= 7 ? 'overdue_7' : 'overdue_1';
        taskTitle = `Overdue milestone — ${milestoneName}`;
        taskDescription =
          `Grant milestone "${milestoneName}" for ${grantName} was due on ${dueDate}` +
          ` and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.` +
          (milestoneDesc ? ` Details: ${milestoneDesc}` : '') +
          ` Update the milestone status or complete it as soon as possible.`;
      } else {
        daysUntilDue = Math.ceil(diffDays);
        priority = daysUntilDue <= MILESTONE_HIGH_PRIORITY_DAYS ? 'high' : 'normal';
        escalationState = daysUntilDue <= MILESTONE_HIGH_PRIORITY_DAYS ? 'approaching' : 'due_soon';
        taskTitle = `Grant milestone due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${milestoneName}`;
        taskDescription =
          `Grant milestone "${milestoneName}" for ${grantName} is due on ${dueDate}` +
          ` (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
          (milestoneDesc ? ` Details: ${milestoneDesc}` : '') +
          ` Complete or update this milestone before the deadline.`;
      }

      const milestoneLinks: UpsertGeneratedTaskInput['links'] = [
        { entityType: 'grant_milestone', entityId: milestoneId, relationship: 'primary' },
        { entityType: 'grant', entityId: grantId, relationship: 'context' },
      ];
      if (holdingId) milestoneLinks.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
      if (portfolioId) milestoneLinks.push({ entityType: 'portfolio', entityId: portfolioId, relationship: 'context' });

      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_milestone:${milestoneId}:due`,
        title: taskTitle,
        description: taskDescription,
        taskType: 'review',
        priority,
        dueAt: dueDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: isOverdue ? 'overdue' : 'upcoming_milestone',
          source_status: status,
          escalation_state: escalationState,
          ...(isOverdue ? { days_overdue: daysOverdue } : { days_until_due: daysUntilDue }),
          grant_id: grantId,
          generated_at: generatedAt,
        },
        links: milestoneLinks,
        reopenResolved: false,
      };

      if (!dryRun) {
        const upsertResult = await upsertGeneratedTask(db, task);
        if (upsertResult === 'created') result.created++;
        else if (upsertResult === 'updated') result.updated++;
        else result.skipped++;
      } else {
        result.skipped++;
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
  // Scope to org via grants.org_id.
  // Filter: submitted_date IS NULL AND received_at IS NULL AND due_date within 45 days.
  // -------------------------------------------------------------------------

  const reportHorizon = new Date(now);
  reportHorizon.setDate(reportHorizon.getDate() + REPORT_REMINDER_DAYS);
  const reportHorizonStr = reportHorizon.toISOString().slice(0, 10);

  const { data: reports, error: reportsError } = await (db
    .from('grant_reports')
    .select(
      'id, grant_id, report_type, due_date, submitted_date, received_at, grants!inner(org_id, portfolio_id, holding_id, holdings!inner(name))'
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
    return r.grants?.org_id === orgId;
  });

  result.scanned += orgReports.length;

  for (const report of orgReports) {
    const reportId = report.id as string;
    const grantId = report.grant_id as string;
    const reportType = ((report.report_type as string | null) ?? 'report').replace(/_/g, ' ');
    const dueDate = report.due_date as string;
    const grantRecord = (report as any).grants ?? {};
    const portfolioId = (grantRecord.portfolio_id as string | null) ?? null;
    const holdingId = (grantRecord.holding_id as string | null) ?? null;
    const grantName = (grantRecord.holdings?.name as string | null) ?? 'grant';

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
        sourceKey: `grant_report:${reportId}:due`,
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
        links: (() => {
          const l: UpsertGeneratedTaskInput['links'] = [
            { entityType: 'grant_report', entityId: reportId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ];
          if (holdingId) l.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
          if (portfolioId) l.push({ entityType: 'portfolio', entityId: portfolioId, relationship: 'context' });
          return l;
        })(),
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
  // Scope to org via grants.org_id.
  // Window: scheduled within 14 days (PAYMENT_REMINDER_DAYS) or already overdue.
  // -------------------------------------------------------------------------

  const paymentHorizon = new Date(now);
  paymentHorizon.setDate(paymentHorizon.getDate() + PAYMENT_REMINDER_DAYS);
  const paymentHorizonStr = paymentHorizon.toISOString().slice(0, 10);

  const { data: payments, error: paymentsError } = await (db
    .from('grant_payments')
    .select(
      'id, grant_id, payment_number, amount, conditions_met, paid_date, scheduled_date, status, grants!inner(org_id, portfolio_id, holding_id, holdings!inner(name))'
    )
    .is('paid_date', null)
    .eq('conditions_met', false)
    .in('status', ['scheduled', 'approved', 'processing'])
    .not('scheduled_date', 'is', null)
    .lte('scheduled_date', paymentHorizonStr) as any);

  if (paymentsError) {
    result.errors.push({
      sourceType: 'grant_payments',
      sourceId: orgId,
      message: (paymentsError as any).message,
    });
  }

  const orgPayments = (payments ?? []).filter((p: any) => {
    return p.grants?.org_id === orgId && p.conditions_met === false;
  });

  result.scanned += orgPayments.length;

  for (const payment of orgPayments) {
    const paymentId = payment.id as string;
    const grantId = payment.grant_id as string;
    const paymentNumber = payment.payment_number as number;
    const amount = payment.amount as number | null;
    const scheduledDate = (payment.scheduled_date as string | null) ?? null;
    const status = payment.status as string;
    const grantRecord = (payment as any).grants ?? {};
    const portfolioId = (grantRecord.portfolio_id as string | null) ?? null;
    const holdingId = (grantRecord.holding_id as string | null) ?? null;
    const grantName = (grantRecord.holdings?.name as string | null) ?? 'grant';
    const isPaymentOverdue = scheduledDate !== null && scheduledDate < today;
    const paymentPriority: UpsertGeneratedTaskInput['priority'] = isPaymentOverdue ? 'urgent' : 'high';

    const amountStr = amount != null
      ? ` ($${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
      : '';

    try {
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_payment:${paymentId}:conditions`,
        title: `Grant payment #${paymentNumber} awaiting conditions — ${grantName}`,
        description:
          `Payment #${paymentNumber}${amountStr} for ${grantName} cannot be disbursed because` +
          ` its conditions have not yet been marked as met.` +
          (scheduledDate ? ` This payment is scheduled for ${scheduledDate}.` : '') +
          ` Review and confirm all disbursement conditions, then update the payment record.`,
        taskType: 'approval',
        priority: paymentPriority,
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
        links: (() => {
          const l: UpsertGeneratedTaskInput['links'] = [
            { entityType: 'grant_payment', entityId: paymentId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ];
          if (holdingId) l.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
          return l;
        })(),
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

  // -------------------------------------------------------------------------
  // 4. Renewal reminders
  //
  // Grants in 'active' stage where:
  //   - renewal_eligible = true
  //   - grant_period_end is within the next 90 days (not already overdue)
  // -------------------------------------------------------------------------

  const RENEWAL_REMINDER_DAYS = 90;
  const renewalHorizon = new Date(now);
  renewalHorizon.setDate(renewalHorizon.getDate() + RENEWAL_REMINDER_DAYS);
  const renewalHorizonStr = renewalHorizon.toISOString().slice(0, 10);

  const { data: renewalGrants, error: renewalError } = await (db
    .from('grants')
    .select('id, lifecycle_stage, grant_period_end, renewal_eligible, org_id, portfolio_id, holding_id, holdings!inner(name)')
    .eq('org_id', orgId)
    .eq('lifecycle_stage', 'active')
    .eq('renewal_eligible', true)
    .not('grant_period_end', 'is', null)
    .gte('grant_period_end', today)
    .lte('grant_period_end', renewalHorizonStr) as any);

  if (renewalError) {
    result.errors.push({ sourceType: 'grants_renewal', sourceId: orgId, message: (renewalError as any).message });
  }

  for (const g of (renewalGrants ?? [])) {
    const grantId = g.id as string;
    const grantName = (g as any).holdings?.name ?? 'grant';
    const endDate = g.grant_period_end as string;
    const daysUntilEnd = Math.ceil((new Date(endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    result.scanned++;
    try {
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId: (g.portfolio_id as string | null) ?? null,
        sourceKey: `grant:${grantId}:renewal`,
        title: `Renewal decision due in ${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} — ${grantName}`,
        description: `Grant "${grantName}" is eligible for renewal and its period ends on ${endDate} (${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} away). Initiate renewal review to decide whether to renew, extend, or close this grant.`,
        taskType: 'review',
        priority: daysUntilEnd <= 30 ? 'high' : 'normal',
        dueAt: endDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: 'renewal_approaching',
          source_status: 'active',
          escalation_state: daysUntilEnd <= 30 ? 'approaching' : 'upcoming',
          days_until_end: daysUntilEnd,
          generated_at: generatedAt,
        },
        links: [
          { entityType: 'grant', entityId: grantId, relationship: 'primary' },
          ...(g.holding_id ? [{ entityType: 'holding' as const, entityId: g.holding_id as string, relationship: 'context' as const }] : []),
          ...(g.portfolio_id ? [{ entityType: 'portfolio' as const, entityId: g.portfolio_id as string, relationship: 'context' as const }] : []),
        ],
        reopenResolved: false,
      };
      if (!dryRun) {
        const r = await upsertGeneratedTask(db, task);
        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({ sourceType: 'grants_renewal', sourceId: grantId, message: err?.message ?? String(err) });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Closeout reminders
  //
  // Grants in 'active' or 'renewal_review' where grant_period_end has passed.
  // -------------------------------------------------------------------------

  const { data: closeoutGrants, error: closeoutError } = await (db
    .from('grants')
    .select('id, lifecycle_stage, grant_period_end, org_id, portfolio_id, holding_id, holdings!inner(name)')
    .eq('org_id', orgId)
    .in('lifecycle_stage', ['active', 'renewal_review'])
    .not('grant_period_end', 'is', null)
    .lt('grant_period_end', today) as any);

  if (closeoutError) {
    result.errors.push({ sourceType: 'grants_closeout', sourceId: orgId, message: (closeoutError as any).message });
  }

  for (const g of (closeoutGrants ?? [])) {
    const grantId = g.id as string;
    const grantName = (g as any).holdings?.name ?? 'grant';
    const endDate = g.grant_period_end as string;
    const daysOver = Math.ceil((now.getTime() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24));

    result.scanned++;
    try {
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId: (g.portfolio_id as string | null) ?? null,
        sourceKey: `grant:${grantId}:closeout`,
        title: `Grant period ended ${daysOver} day${daysOver === 1 ? '' : 's'} ago — initiate closeout for ${grantName}`,
        description: `Grant "${grantName}" had its period end on ${endDate}. The grant is still in "${(g.lifecycle_stage as string).replace(/_/g, ' ')}" stage. Initiate the closeout process to finalize reporting, payments, and documentation.`,
        taskType: 'review',
        priority: daysOver >= 30 ? 'urgent' : 'high',
        dueAt: null,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: 'closeout_needed',
          source_status: g.lifecycle_stage as string,
          escalation_state: daysOver >= 30 ? 'overdue_30' : 'overdue',
          days_overdue: daysOver,
          generated_at: generatedAt,
        },
        links: [
          { entityType: 'grant', entityId: grantId, relationship: 'primary' },
          ...(g.holding_id ? [{ entityType: 'holding' as const, entityId: g.holding_id as string, relationship: 'context' as const }] : []),
          ...(g.portfolio_id ? [{ entityType: 'portfolio' as const, entityId: g.portfolio_id as string, relationship: 'context' as const }] : []),
        ],
        reopenResolved: false,
      };
      if (!dryRun) {
        const r = await upsertGeneratedTask(db, task);
        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({ sourceType: 'grants_closeout', sourceId: grantId, message: err?.message ?? String(err) });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Unsigned agreements
  //
  // Grants in 'approved' stage (haven't moved to 'agreement') where the most
  // recent history entry is > 7 days old (approval is stale).
  // -------------------------------------------------------------------------

  const AGREEMENT_STALE_DAYS = 7;
  const agreementCutoff = new Date(now);
  agreementCutoff.setDate(agreementCutoff.getDate() - AGREEMENT_STALE_DAYS);
  const agreementCutoffStr = agreementCutoff.toISOString();

  const { data: approvedGrants, error: approvedError } = await (db
    .from('grants')
    .select('id, org_id, portfolio_id, holding_id, holdings!inner(name)')
    .eq('org_id', orgId)
    .eq('lifecycle_stage', 'approved') as any);

  if (approvedError) {
    result.errors.push({ sourceType: 'grants_agreement', sourceId: orgId, message: (approvedError as any).message });
  }

  for (const g of (approvedGrants ?? [])) {
    const grantId = g.id as string;
    const grantName = (g as any).holdings?.name ?? 'grant';

    // Check if the most recent status history entry is stale
    const { data: latestHistory } = await db
      .from('grant_status_history')
      .select('created_at')
      .eq('grant_id', grantId)
      .eq('to_stage', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as any;

    if (!latestHistory) continue;
    if (latestHistory.created_at > agreementCutoffStr) continue; // Not stale yet

    const daysStale = Math.ceil((now.getTime() - new Date(latestHistory.created_at).getTime()) / (1000 * 60 * 60 * 24));

    result.scanned++;
    try {
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId: (g.portfolio_id as string | null) ?? null,
        sourceKey: `grant:${grantId}:agreement`,
        title: `Grant agreement not yet signed — ${grantName}`,
        description: `Grant "${grantName}" was approved ${daysStale} day${daysStale === 1 ? '' : 's'} ago but has not yet moved to the Agreement stage. Prepare and execute the grant agreement to proceed.`,
        taskType: 'approval',
        priority: daysStale >= 21 ? 'urgent' : 'high',
        dueAt: null,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: 'unsigned_agreement',
          source_status: 'approved',
          escalation_state: daysStale >= 21 ? 'stale_21' : 'stale',
          days_since_approval: daysStale,
          generated_at: generatedAt,
        },
        links: [
          { entityType: 'grant', entityId: grantId, relationship: 'primary' },
          ...(g.holding_id ? [{ entityType: 'holding' as const, entityId: g.holding_id as string, relationship: 'context' as const }] : []),
          ...(g.portfolio_id ? [{ entityType: 'portfolio' as const, entityId: g.portfolio_id as string, relationship: 'context' as const }] : []),
        ],
        reopenResolved: false,
      };
      if (!dryRun) {
        const r = await upsertGeneratedTask(db, task);
        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({ sourceType: 'grants_agreement', sourceId: grantId, message: err?.message ?? String(err) });
    }
  }

  // Only return a result if we actually had entries to scan or errors
  if (result.scanned === 0 && result.errors.length === 0) {
    return [];
  }

  return [result];
}
