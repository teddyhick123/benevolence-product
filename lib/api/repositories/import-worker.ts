import { createElevatedClient } from '@/lib/api/admin-client';
import type { AccessPrincipal } from '@/lib/api/principals';
import { extractCSVToStaging } from '@/lib/import/csv-extractor';
import { runTransformValidate } from '@/lib/import/etl-runner';
import type { EntityType, MappingProfile } from '@/lib/import/types';

type JobPrincipal = Extract<AccessPrincipal, { kind: 'job' }>;

type ImportWorkerScope = {
  principal: JobPrincipal;
  importJobId: string;
};

const ENTITY_TYPES = new Set<EntityType>([
  'donors',
  'investees',
  'holdings',
  'contributions',
  'metrics',
]);

/** Service-backed import processing constrained to one queued import job. */
export function createImportWorkerRepository(scope: ImportWorkerScope) {
  if (scope.principal.job !== 'import') throw new Error('Invalid import worker principal');
  const db = createElevatedClient();

  return {
    async process(input: {
      storagePaths?: Partial<Record<EntityType, string>>;
      mappingProfileId?: string;
    }) {
      const { data: job, error: jobError } = await db
        .from('import_jobs')
        .select('id, org_id, portfolio_id, mapping_profile_id')
        .eq('id', scope.importJobId)
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job) throw new Error('Import job not found');

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
      try {
        const entries = Object.entries(input.storagePaths ?? {}) as Array<[EntityType, string]>;
        if (entries.length === 0) throw new Error('No storage paths provided for import');
        const pathPrefix = `${job.org_id}/imports/${scope.importJobId}/`;
        for (const [entityType, storagePath] of entries) {
          if (!ENTITY_TYPES.has(entityType)) {
            throw new Error(`Unknown import entity type: ${entityType}`);
          }
          if (typeof storagePath !== 'string' || !storagePath.startsWith(pathPrefix)) {
            throw new Error(`Invalid storage path for import job ${scope.importJobId}`);
          }
        }

        if (input.mappingProfileId && input.mappingProfileId !== job.mapping_profile_id) {
          throw new Error('Queued mapping profile does not match the import job');
        }

        let profile: MappingProfile | null = null;
        if (job.mapping_profile_id) {
          const { data, error } = await db
            .from('import_mapping_profiles')
            .select('*')
            .eq('id', job.mapping_profile_id)
            .eq('org_id', job.org_id)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Import mapping profile not found in job organization');
          profile = data as MappingProfile;
        }

        const now = new Date().toISOString();
        const { error: startError } = await db
          .from('import_jobs')
          .update({ status: 'processing', started_at: now, last_heartbeat_at: now })
          .eq('id', scope.importJobId)
          .eq('org_id', job.org_id);
        if (startError) throw startError;

        heartbeatInterval = setInterval(() => {
          db.from('import_jobs')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('id', scope.importJobId)
            .eq('org_id', job.org_id)
            .eq('status', 'processing')
            .then(() => {}, () => {});
        }, 30_000);

        const extractionErrors: string[] = [];
        // Keep extraction sequential because each extractor updates the shared job total.
        for (const [entityType, storagePath] of entries) {
          try {
            const result = await extractCSVToStaging(
              db,
              scope.importJobId,
              storagePath,
              entityType
            );
            extractionErrors.push(...result.errors);
          } catch (error: unknown) {
            extractionErrors.push(error instanceof Error ? error.message : String(error));
          }
        }

        if (profile) {
          await runTransformValidate(db, scope.importJobId, profile, {
            portfolioId: job.portfolio_id ?? undefined,
          });
        }

        const { error: reviewError } = await db
          .from('import_jobs')
          .update({ status: 'needs_review', error_message: null })
          .eq('id', scope.importJobId)
          .eq('org_id', job.org_id)
          .eq('status', 'processing');
        if (reviewError) throw reviewError;

        return { extractionErrors };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await db
          .from('import_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            error_details: {
              failed_at: new Date().toISOString(),
              stage: 'worker',
            },
            completed_at: new Date().toISOString(),
          })
          .eq('id', scope.importJobId)
          .eq('org_id', job.org_id);
        throw error;
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    },
  };
}

/** Global stale-job maintenance performed by the server's watchdog principal. */
export function createImportWatchdogRepository(principal: JobPrincipal) {
  if (principal.job !== 'import-watchdog') throw new Error('Invalid import watchdog principal');
  const db = createElevatedClient();

  return {
    reapStaleJobs(staleThresholdMinutes: number) {
      return db.rpc('mark_stale_import_jobs', {
        p_stale_threshold_minutes: staleThresholdMinutes,
      });
    },
  };
}
