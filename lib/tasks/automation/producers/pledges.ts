// lib/tasks/automation/producers/pledges.ts
//
// Produces follow-up tasks for pledge installments that are due soon or overdue.
//
// Source key format:
//   due_soon:  pledge_installment:{id}:due_soon
//   overdue:   pledge_installment:{id}:overdue
//
// Prefix for closing all tasks for an installment: pledge_installment:{id}:

import { createAdminClient } from '@/lib/supabase';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask, completeGeneratedTasks } from '../task-writer';

const PRODUCER_ID = 'pledge_follow_up';

// Days before due_date to start generating due-soon tasks
const DUE_SOON_DAYS = 14;
// Threshold (in days) between normal and high priority for due-soon tasks
const HIGH_PRIORITY_DAYS = 7;
// Threshold (in days overdue) between high and urgent priority
const URGENT_OVERDUE_DAYS = 7;

export async function pledgeFollowUpProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  const { orgId, dryRun = false, now: nowOverride } = options;

  // Require an orgId — this producer is always org-scoped
  if (!orgId) return [];

  const now = nowOverride ?? new Date();
  const today = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Window: installments due within [today, today + DUE_SOON_DAYS]
  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_DAYS);
  const dueSoonCutoffStr = dueSoonCutoff.toISOString().slice(0, 10);

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

  // Query all pending installments that are either overdue OR due within the window.
  // pledge_installments has org_id directly, so we don't need a join for org scoping.
  // We join pledges to get relationship_manager (pledges has no portfolio_id).
  const { data: installments, error: fetchError } = await db
    .from('pledge_installments')
    .select(`
      id,
      pledge_id,
      org_id,
      due_date,
      amount,
      status,
      pledges!inner (
        id,
        relationship_manager,
        donor_id
      )
    `)
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .lte('due_date', dueSoonCutoffStr);

  if (fetchError) {
    result.errors.push({
      sourceType: 'pledge_installments',
      sourceId: orgId,
      message: fetchError.message,
    });
    return [result];
  }

  if (!installments || installments.length === 0) {
    return [];
  }

  result.scanned = installments.length;

  const generatedAt = now.toISOString();

  for (const inst of installments) {
    const instId = inst.id as string;
    const pledgeId = inst.pledge_id as string;
    const dueDate = inst.due_date as string;
    const amount = inst.amount as number;
    const pledge = inst.pledges as unknown as {
      id: string;
      relationship_manager: string | null;
      donor_id: string;
    };

    const dueDateMs = new Date(dueDate).getTime();
    const nowMs = now.getTime();
    const diffDays = (dueDateMs - nowMs) / (1000 * 60 * 60 * 24);

    const isOverdue = dueDate < today;

    try {
      if (isOverdue) {
        // Before creating the overdue task, complete any due_soon task for this installment
        if (!dryRun) {
          const completed = await completeGeneratedTasks(
            db,
            orgId,
            `pledge_installment:${instId}:due_soon`,
            'Installment is now overdue'
          );
          result.completed += completed;
        }

        const daysOverdue = Math.floor((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));
        const priority: UpsertGeneratedTaskInput['priority'] =
          daysOverdue > URGENT_OVERDUE_DAYS ? 'urgent' : 'high';

        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId: null,
          sourceKey: `pledge_installment:${instId}:overdue`,
          title: `Overdue pledge installment — $${amount.toLocaleString()}`,
          description: `Pledge installment of $${amount.toLocaleString()} was due on ${dueDate} and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue. Follow up with the donor to collect or resolve this installment.`,
          taskType: 'follow_up',
          priority,
          dueAt: dueDate,
          assignedTo: pledge.relationship_manager ?? null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'overdue',
            source_status: 'pending',
            escalation_state: 'overdue',
            days_overdue: daysOverdue,
            generated_at: generatedAt,
          },
          links: [
            { entityType: 'pledge_installment', entityId: instId, relationship: 'primary' },
            { entityType: 'pledge', entityId: pledgeId, relationship: 'context' },
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
        // Due soon (not overdue)
        const daysUntilDue = Math.ceil(diffDays);
        const priority: UpsertGeneratedTaskInput['priority'] =
          daysUntilDue <= HIGH_PRIORITY_DAYS ? 'high' : 'normal';

        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId: null,
          sourceKey: `pledge_installment:${instId}:due_soon`,
          title: `Pledge installment due soon — $${amount.toLocaleString()}`,
          description: `Pledge installment of $${amount.toLocaleString()} is due on ${dueDate} (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away). Ensure payment is collected or contact the donor to confirm.`,
          taskType: 'follow_up',
          priority,
          dueAt: dueDate,
          assignedTo: pledge.relationship_manager ?? null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'due_soon',
            source_status: 'pending',
            escalation_state: 'due_soon',
            days_until_due: daysUntilDue,
            generated_at: generatedAt,
          },
          links: [
            { entityType: 'pledge_installment', entityId: instId, relationship: 'primary' },
            { entityType: 'pledge', entityId: pledgeId, relationship: 'context' },
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
        sourceType: 'pledge_installment',
        sourceId: instId,
        message: err?.message ?? String(err),
      });
    }
  }

  return [result];
}
