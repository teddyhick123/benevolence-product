import { createElevatedClient } from '@/lib/api/admin-client';
import type { JobAccessContext } from '@/lib/api/principals';
import { runProducers } from '@/lib/tasks/automation/run';

export type TaskRunFilters = {
  orgId?: string;
  producer?: string;
  limit: number;
};

type GenerateTasksInput = {
  producer?: string;
  orgId?: string;
  sourceType?: string;
  sourceId?: string;
  dryRun: boolean;
  now?: string;
};

const TASK_RUN_COLUMNS =
  'id, producer, org_id, dry_run, status, scanned, created_count, updated_count, completed_count, skipped_count, error_count, metadata, created_at, completed_at';

export class InvalidTaskJobPrincipalError extends Error {
  constructor() {
    super('Task worker requires the tasks job principal');
    this.name = 'InvalidTaskJobPrincipalError';
  }
}

/** Global task automation operations available only to the tasks job. */
export function createTaskJobRepository(context: JobAccessContext) {
  if (context.principal.job !== 'tasks') {
    throw new InvalidTaskJobPrincipalError();
  }

  const db = createElevatedClient();

  return {
    async generate(input: GenerateTasksInput) {
      const now = input.now ? new Date(input.now) : new Date();
      const runId = crypto.randomUUID();

      // The migration documents this lock as best-effort: it is transaction
      // scoped, so it is already released here and its boolean cannot gate the
      // run. The run row below is the durable concurrency signal. An RPC error
      // is different from a lost race and must not start unguarded work.
      const { error: lockError } = await db.rpc('try_task_automation_lock', {
        lock_key: `task_automation:${input.producer ?? 'all'}:${input.orgId ?? 'all'}`,
      });
      if (lockError) {
        return {
          ok: false as const,
          status: 500,
          error: `Task automation lock unavailable: ${lockError.message}`,
        };
      }

      let inflightQuery = db
        .from('task_automation_runs')
        .select('id')
        .eq('status', 'running')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
      if (input.producer) inflightQuery = inflightQuery.eq('producer', input.producer);
      if (input.orgId) inflightQuery = inflightQuery.eq('org_id', input.orgId);
      const { data: inflightRun, error: inflightError } = await inflightQuery.maybeSingle();

      // An unreadable scan is not an idle queue; running now could double-write.
      if (inflightError) {
        return {
          ok: false as const,
          status: 500,
          error: `Concurrency check failed: ${inflightError.message}`,
        };
      }

      if (inflightRun) {
        return {
          ok: false as const,
          status: 409,
          error: 'Concurrent run in progress',
          run_id: inflightRun.id,
        };
      }

      if (!input.dryRun) {
        // This row is both the execution history and the concurrency guard, so
        // work must not start when it cannot be written.
        const { error: runRecordError } = await db.from('task_automation_runs').insert({
          id: runId,
          producer: input.producer ?? null,
          org_id: input.orgId ?? null,
          dry_run: false,
          status: 'running',
        });
        if (runRecordError) {
          return {
            ok: false as const,
            status: 500,
            error: `Task run could not be recorded: ${runRecordError.message}`,
          };
        }
      }

      try {
        const results = await runProducers({
          producerId: input.producer,
          orgId: input.orgId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          dryRun: input.dryRun,
          now,
        });

        const totals = results.reduce(
          (acc, result) => ({
            scanned: acc.scanned + result.scanned,
            created: acc.created + result.created,
            updated: acc.updated + result.updated,
            completed: acc.completed + result.completed,
            skipped: acc.skipped + result.skipped,
            errors: acc.errors + result.errors.length,
          }),
          { scanned: 0, created: 0, updated: 0, completed: 0, skipped: 0, errors: 0 }
        );

        if (!input.dryRun) {
          const { error: completionError } = await db
            .from('task_automation_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              scanned: totals.scanned,
              created_count: totals.created,
              updated_count: totals.updated,
              completed_count: totals.completed,
              skipped_count: totals.skipped,
              error_count: totals.errors,
              metadata: { results },
            })
            .eq('id', runId);

          // The producers already ran, but the row is still `running` and will
          // block later runs for the in-flight window, so this needs an alert
          // and manual reconciliation rather than a silent success.
          if (completionError) {
            return {
              ok: false as const,
              status: 500,
              run_id: runId,
              error: `Task run completed but its history could not be persisted: ${completionError.message}`,
            };
          }
        }

        return {
          ok: true as const,
          status: 200,
          run_id: input.dryRun ? null : runId,
          results,
        };
      } catch (error: any) {
        let message = error.message;

        if (!input.dryRun) {
          const { error: failureRecordError } = await db
            .from('task_automation_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              metadata: { error: error.message },
            })
            .eq('id', runId);

          // Report the producer failure as the cause; a bookkeeping failure is
          // additional context and must not mask it.
          if (failureRecordError) {
            message = `${message} (run status could not be recorded: ${failureRecordError.message})`;
          }
        }

        return {
          ok: false as const,
          status: 500,
          run_id: input.dryRun ? null : runId,
          error: message,
        };
      }
    },

    async listRuns(filters: TaskRunFilters) {
      let query = db
        .from('task_automation_runs')
        .select(TASK_RUN_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(filters.limit);

      if (filters.producer) query = query.eq('producer', filters.producer);
      if (filters.orgId) query = query.eq('org_id', filters.orgId);

      return query;
    },
  };
}

/** Session-backed listing that remains subject to task_automation_runs RLS. */
export async function listOrgTaskRuns(
  db: JobRunSessionClient,
  orgId: string,
  filters: Omit<TaskRunFilters, 'orgId'>
) {
  let query = db
    .from('task_automation_runs')
    .select(TASK_RUN_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(filters.limit);

  if (filters.producer) query = query.eq('producer', filters.producer);
  return query;
}

type JobRunSessionClient = {
  from: (_table: 'task_automation_runs') => any;
};
