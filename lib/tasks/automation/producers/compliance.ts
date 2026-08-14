// lib/tasks/automation/producers/compliance.ts
//
// Produces reminder and overdue tasks for:
//   1. filing_calendar entries (regulatory filing deadlines)
//   2. state_registrations renewal deadlines
//
// Source key formats:
//   Filing reminder:      filing:{id}:reminder
//   Filing overdue:       filing:{id}:overdue
//   State reg reminder/overdue: state_registration:{id}:renewal
//
// Prefix for closing all tasks for a filing: filing:{id}:
// Prefix for closing all tasks for a state reg: state_registration:{id}:

import { createElevatedClient } from '@/lib/api/admin-client';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask, completeGeneratedTasks } from '../task-writer';

const PRODUCER_ID = 'compliance_deadlines';

// Default reminder window if reminder_days is null/empty
const DEFAULT_REMINDER_DAYS = [30, 14, 7];

// State registrations: start generating renewal tasks 60 days out
const STATE_REG_REMINDER_DAYS = 60;
// Non-actionable statuses — we skip these
const FILING_TERMINAL_STATUSES = ['filed', 'waived', 'not_applicable'];
// Statuses we query for
const FILING_ACTIVE_STATUSES = ['upcoming', 'in_progress', 'extended', 'overdue'];

// State registration statuses we query for renewals
const STATE_REG_ACTIVE_STATUSES = ['active', 'renewal_due'];

export async function complianceDeadlinesProducer(
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
  // 1. Filing calendar
  // -------------------------------------------------------------------------

  // Compute the outer horizon: max possible reminder window.
  // Since reminder_days is per-entry, we use a generous outer horizon (90 days)
  // and then filter per entry using its own reminder_days.
  const filingHorizon = new Date(now);
  filingHorizon.setDate(filingHorizon.getDate() + 90);
  const filingHorizonStr = filingHorizon.toISOString().slice(0, 10);

  const { data: filings, error: filingsError } = await db
    .from('filing_calendar')
    .select('id, org_id, title, filing_type, due_date, extension_due_date, status, reminder_days, jurisdiction')
    .eq('org_id', orgId)
    .in('status', FILING_ACTIVE_STATUSES)
    .lte('due_date', filingHorizonStr)
    .order('due_date');

  if (filingsError) {
    result.errors.push({
      sourceType: 'filing_calendar',
      sourceId: orgId,
      message: filingsError.message,
    });
    // Still try state registrations below — don't early-return yet
  }

  if (filings && filings.length > 0) {
    result.scanned += filings.length;

    for (const filing of filings) {
      const filingId = filing.id as string;
      const dueDate = filing.due_date as string;
      const status = filing.status as string;
      const reminderDays: number[] = (filing.reminder_days as number[] | null) ?? DEFAULT_REMINDER_DAYS;
      const title = filing.title as string;
      const filingType = filing.filing_type as string;
      const jurisdiction = (filing.jurisdiction as string | null) ?? '';

      // When the filing has been extended, use extension_due_date as the deadline
      const extensionDueDate = (filing.extension_due_date as string | null) ?? null;
      const effectiveDueDate: string =
        status === 'extended' && extensionDueDate ? extensionDueDate : dueDate;

      // Max reminder window for this entry
      const maxReminderDays = reminderDays.length > 0 ? Math.max(...reminderDays) : 30;

      const dueDateMs = new Date(effectiveDueDate).getTime();
      const nowMs = now.getTime();
      const diffDays = (dueDateMs - nowMs) / (1000 * 60 * 60 * 24);

      const isOverdue = effectiveDueDate < today;

      try {
        if (isOverdue) {
          // Complete any existing reminder task first
          if (!dryRun) {
            const completed = await completeGeneratedTasks(
              db,
              orgId,
              `filing:${filingId}:reminder`,
              'Filing deadline has passed — now overdue'
            );
            result.completed += completed;
          }

          const daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));

          const filingOverdueBase = {
            orgId,
            portfolioId: null as null,
            sourceKey: `filing:${filingId}:overdue`,
            title: `Overdue filing — ${title}`,
            description:
              `The ${filingType.replace(/_/g, ' ')} filing "${title}"` +
              (jurisdiction ? ` (${jurisdiction})` : '') +
              ` was due on ${effectiveDueDate} and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.` +
              ` File immediately or document the resolution (waiver, extension, etc.).`,
            taskType: 'reminder' as const,
            priority: 'urgent' as const,
            dueAt: effectiveDueDate,
            assignedTo: null as null,
            links: [{ entityType: 'filing' as const, entityId: filingId, relationship: 'primary' as const }],
            reopenResolved: false,
          };
          const filingOverdueMeta = {
            producer: PRODUCER_ID,
            reason: 'overdue',
            source_status: status,
            days_overdue: daysOverdue,
            filing_type: filingType,
            jurisdiction,
            generated_at: generatedAt,
          };

          let task: UpsertGeneratedTaskInput;
          if (daysOverdue >= 30) {
            task = { ...filingOverdueBase, metadata: { ...filingOverdueMeta, escalation_state: 'overdue_30' } };
          } else if (daysOverdue >= 7) {
            task = { ...filingOverdueBase, metadata: { ...filingOverdueMeta, escalation_state: 'overdue_7' } };
          } else {
            task = { ...filingOverdueBase, metadata: { ...filingOverdueMeta, escalation_state: 'overdue_1' } };
          }

          if (!dryRun) {
            const upsertResult = await upsertGeneratedTask(db, task);
            if (upsertResult === 'created') result.created++;
            else if (upsertResult === 'updated') result.updated++;
            else result.skipped++;
          }
        } else if (diffDays <= maxReminderDays) {
          // Within reminder window — compute escalation tier
          const daysUntilDue = Math.ceil(diffDays);

          const filingReminderDescription =
            `The ${filingType.replace(/_/g, ' ')} filing "${title}"` +
            (jurisdiction ? ` (${jurisdiction})` : '') +
            ` is due on ${effectiveDueDate} (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
            ` Ensure this filing is completed on time to avoid penalties.`;
          const filingReminderBase = {
            orgId,
            portfolioId: null as null,
            sourceKey: `filing:${filingId}:reminder`,
            title: `Filing due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${title}`,
            description: filingReminderDescription,
            taskType: 'reminder' as const,
            dueAt: effectiveDueDate,
            assignedTo: null as null,
            links: [{ entityType: 'filing' as const, entityId: filingId, relationship: 'primary' as const }],
            reopenResolved: false,
          };
          const filingReminderMeta = {
            producer: PRODUCER_ID,
            reason: 'deadline_reminder',
            source_status: status,
            days_until_due: daysUntilDue,
            filing_type: filingType,
            jurisdiction,
            generated_at: generatedAt,
          };

          let task: UpsertGeneratedTaskInput;
          if (daysUntilDue <= 7) {
            task = { ...filingReminderBase, priority: 'urgent', metadata: { ...filingReminderMeta, escalation_state: 'reminder_7' } };
          } else if (daysUntilDue <= 14) {
            task = { ...filingReminderBase, priority: 'high', metadata: { ...filingReminderMeta, escalation_state: 'reminder_14' } };
          } else {
            task = { ...filingReminderBase, priority: 'normal', metadata: { ...filingReminderMeta, escalation_state: 'reminder_30' } };
          }

          if (!dryRun) {
            const upsertResult = await upsertGeneratedTask(db, task);
            if (upsertResult === 'created') result.created++;
            else if (upsertResult === 'updated') result.updated++;
            else result.skipped++;
          }
        } else {
          // Not yet within any reminder window
          result.skipped++;
        }
      } catch (err: any) {
        result.errors.push({
          sourceType: 'filing_calendar',
          sourceId: filingId,
          message: err?.message ?? String(err),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. State registrations renewal reminders
  // -------------------------------------------------------------------------

  const regHorizon = new Date(now);
  regHorizon.setDate(regHorizon.getDate() + STATE_REG_REMINDER_DAYS);
  const regHorizonStr = regHorizon.toISOString().slice(0, 10);

  const { data: registrations, error: regsError } = await db
    .from('state_registrations')
    .select('id, org_id, state, registration_type, status, renewal_due_date, registration_number')
    .eq('org_id', orgId)
    .in('status', STATE_REG_ACTIVE_STATUSES)
    .lte('renewal_due_date', regHorizonStr)
    .order('renewal_due_date');

  if (regsError) {
    result.errors.push({
      sourceType: 'state_registrations',
      sourceId: orgId,
      message: regsError.message,
    });
  }

  if (registrations && registrations.length > 0) {
    result.scanned += registrations.length;

    for (const reg of registrations) {
      const regId = reg.id as string;
      const renewalDue = reg.renewal_due_date as string | null;
      const state = reg.state as string;
      const regType = (reg.registration_type as string).replace(/_/g, ' ');
      const regNumber = (reg.registration_number as string | null) ?? '';
      const status = reg.status as string;

      if (!renewalDue) {
        result.skipped++;
        continue;
      }

      const dueDateMs = new Date(renewalDue).getTime();
      const nowMs = now.getTime();
      const diffDays = (dueDateMs - nowMs) / (1000 * 60 * 60 * 24);
      const isOverdue = renewalDue < today;

      try {
        if (isOverdue) {
          const daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));

          const task: UpsertGeneratedTaskInput = {
            orgId,
            portfolioId: null,
            sourceKey: `state_registration:${regId}:renewal`,
            title: `Overdue state registration renewal — ${state}`,
            description:
              `The ${regType} registration in ${state}` +
              (regNumber ? ` (${regNumber})` : '') +
              ` had a renewal deadline of ${renewalDue} and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past due.` +
              ` Renew immediately or update the registration status.`,
            taskType: 'reminder',
            priority: 'urgent',
            dueAt: renewalDue,
            assignedTo: null,
            metadata: {
              producer: PRODUCER_ID,
              reason: 'renewal_overdue',
              source_status: status,
              escalation_state: 'overdue',
              days_overdue: daysOverdue,
              state,
              registration_type: reg.registration_type,
              generated_at: generatedAt,
            },
            links: [{ entityType: 'state_registration', entityId: regId, relationship: 'primary' }],
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

          const stateRegReminderBase = {
            orgId,
            portfolioId: null as null,
            sourceKey: `state_registration:${regId}:renewal`,
            title: `State registration renewal due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${state}`,
            description:
              `The ${regType} registration in ${state}` +
              (regNumber ? ` (${regNumber})` : '') +
              ` is up for renewal on ${renewalDue} (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
              ` Submit the renewal application and any required fees to maintain active registration.`,
            taskType: 'reminder' as const,
            dueAt: renewalDue,
            assignedTo: null as null,
            links: [{ entityType: 'state_registration' as const, entityId: regId, relationship: 'primary' as const }],
            reopenResolved: false,
          };
          const stateRegReminderMeta = {
            producer: PRODUCER_ID,
            reason: 'renewal_reminder',
            source_status: status,
            days_until_due: daysUntilDue,
            state,
            registration_type: reg.registration_type,
            generated_at: generatedAt,
          };

          let task: UpsertGeneratedTaskInput;
          if (daysUntilDue <= 7) {
            task = { ...stateRegReminderBase, priority: 'urgent', metadata: { ...stateRegReminderMeta, escalation_state: 'renewal_7' } };
          } else if (daysUntilDue <= 14) {
            task = { ...stateRegReminderBase, priority: 'high', metadata: { ...stateRegReminderMeta, escalation_state: 'renewal_14' } };
          } else if (daysUntilDue <= 30) {
            task = { ...stateRegReminderBase, priority: 'high', metadata: { ...stateRegReminderMeta, escalation_state: 'renewal_30' } };
          } else {
            task = { ...stateRegReminderBase, priority: 'normal', metadata: { ...stateRegReminderMeta, escalation_state: 'renewal_60' } };
          }

          if (!dryRun) {
            const upsertResult = await upsertGeneratedTask(db, task);
            if (upsertResult === 'created') result.created++;
            else if (upsertResult === 'updated') result.updated++;
            else result.skipped++;
          }
        }
      } catch (err: any) {
        result.errors.push({
          sourceType: 'state_registration',
          sourceId: regId,
          message: err?.message ?? String(err),
        });
      }
    }
  }

  // Only return a result if we actually did something (had entries to scan or errors)
  if (result.scanned === 0 && result.errors.length === 0) {
    return [];
  }

  return [result];
}
