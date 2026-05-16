// lib/tasks/automation/producers/imports.ts
//
// Produces tasks for import_jobs that require human attention:
//   1. Error task: job has error_rows > 0, rejected_rows > 0, or error_message set
//   2. Approval task: job is in 'needs_review' state with approved_rows > 0 and no reviewer yet
//   3. Terminal cancel: job is 'failed' or 'rejected' — cancels any open tasks for that job
//
// Source key formats:
//   Error review:     import_job:{id}:review_errors
//   Approval needed:  import_job:{id}:approval
//
// Prefix for cancelling all tasks for a job: import_job:{id}:

import { createAdminClient } from '@/lib/supabase';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask, cancelGeneratedTasks } from '../task-writer';

const PRODUCER_ID = 'import_review';

// Statuses that indicate the job is done — no new tasks needed
const TERMINAL_STATUSES = ['completed', 'rejected', 'failed'];

// Statuses that trigger task cancellation (job ended badly or was rejected)
const CANCEL_STATUSES = ['failed', 'rejected'];

export async function importReviewProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  const { orgId, dryRun = false, now: nowOverride } = options;

  // Require an orgId — this producer is always org-scoped
  if (!orgId) return [];

  const generatedAt = (nowOverride ?? new Date()).toISOString();

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

  // Query all non-completed import jobs for this org
  const { data: jobs, error: jobsError } = await db
    .from('import_jobs')
    .select(
      'id, org_id, entity_type, status, total_rows, processed_rows, approved_rows, rejected_rows, error_rows, error_message, reviewed_by, created_at'
    )
    .eq('org_id', orgId)
    .not('status', 'in', '(completed)')
    .order('created_at', { ascending: false });

  if (jobsError) {
    result.errors.push({
      sourceType: 'import_job',
      sourceId: orgId,
      message: jobsError.message,
    });
    return [result];
  }

  if (!jobs || jobs.length === 0) {
    return [];
  }

  result.scanned = jobs.length;

  for (const job of jobs) {
    const jobId = job.id as string;
    const status = job.status as string;
    const entityType = (job.entity_type as string | null) ?? jobId;
    const errorRows = (job.error_rows as number) ?? 0;
    const rejectedRows = (job.rejected_rows as number) ?? 0;
    const approvedRows = (job.approved_rows as number) ?? 0;
    const errorMessage = (job.error_message as string | null) ?? null;
    const reviewedBy = (job.reviewed_by as string | null) ?? null;

    // Human-friendly label for task titles
    const jobLabel = entityType !== jobId ? `${entityType} import` : jobId;

    try {
      // -----------------------------------------------------------------------
      // Terminal cancellation: job ended badly — cancel any open tasks for it
      // -----------------------------------------------------------------------
      if (CANCEL_STATUSES.includes(status)) {
        if (!dryRun) {
          const cancelled = await cancelGeneratedTasks(
            db,
            orgId,
            `import_job:${jobId}:`,
            'Import job failed or was rejected'
          );
          result.completed += cancelled;
        } else {
          result.skipped++;
        }
        // Do NOT upsert new tasks for failed/rejected jobs
        continue;
      }

      // -----------------------------------------------------------------------
      // Error task: job has error or rejected rows, or an error_message
      // -----------------------------------------------------------------------
      if (errorRows > 0 || rejectedRows > 0 || errorMessage !== null) {
        const errorSummary: string[] = [];
        if (errorRows > 0) errorSummary.push(`${errorRows} error row${errorRows === 1 ? '' : 's'}`);
        if (rejectedRows > 0) errorSummary.push(`${rejectedRows} rejected row${rejectedRows === 1 ? '' : 's'}`);
        if (errorMessage && errorSummary.length === 0) errorSummary.push('a processing error');

        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId: null,
          sourceKey: `import_job:${jobId}:review_errors`,
          title: `Import job has errors — ${jobLabel}`,
          description:
            `The import job for "${jobLabel}" (status: ${status}) has ${errorSummary.join(' and ')}.` +
            (errorMessage ? ` Error: ${errorMessage}.` : '') +
            ' Review the failed rows and decide whether to re-import, skip, or manually correct them.',
          taskType: 'review',
          priority: 'high',
          dueAt: null,
          assignedTo: null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'import_errors',
            source_status: status,
            error_rows: errorRows,
            rejected_rows: rejectedRows,
            error_message: errorMessage,
            generated_at: generatedAt,
          },
          links: [{ entityType: 'import_job', entityId: jobId, relationship: 'primary' }],
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
      }

      // -----------------------------------------------------------------------
      // Approval task: job is needs_review, has approved rows, and no reviewer yet
      // -----------------------------------------------------------------------
      if (status === 'needs_review' && approvedRows > 0 && reviewedBy === null) {
        const task: UpsertGeneratedTaskInput = {
          orgId,
          portfolioId: null,
          sourceKey: `import_job:${jobId}:approval`,
          title: `Import job ready for approval — ${jobLabel}`,
          description:
            `The import job for "${jobLabel}" has ${approvedRows} row${approvedRows === 1 ? '' : 's'} ready for approval.` +
            ' Review and approve (or reject) to complete the import.',
          taskType: 'approval',
          priority: 'normal',
          dueAt: null,
          assignedTo: null,
          metadata: {
            producer: PRODUCER_ID,
            reason: 'needs_approval',
            source_status: status,
            approved_rows: approvedRows,
            generated_at: generatedAt,
          },
          links: [{ entityType: 'import_job', entityId: jobId, relationship: 'primary' }],
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
      } else if (
        status !== 'needs_review' &&
        !CANCEL_STATUSES.includes(status) &&
        errorRows === 0 &&
        rejectedRows === 0 &&
        errorMessage === null
      ) {
        // Job is in progress / pending / approved with no issues — nothing to do
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({
        sourceType: 'import_job',
        sourceId: jobId,
        message: err?.message ?? String(err),
      });
    }
  }

  // Only return a result entry if we had something to report
  if (result.scanned === 0 && result.errors.length === 0) {
    return [];
  }

  return [result];
}
