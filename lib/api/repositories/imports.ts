import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext, OrgAccessContext } from '@/lib/api/principals';
import { loadStagingToProduction } from '@/lib/import/loader';
import { generateReconciliationReport } from '@/lib/import/reconciler';
import { rollbackImport, type RollbackScope } from '@/lib/import/rollback';
import { fromImportStagingRelation } from '@/lib/import/database';
import {
  STAGING_TABLE_MAP,
  type ImportJob,
  type MappingProfile,
} from '@/lib/import/types';
import { completeGeneratedTasks } from '@/lib/tasks/automation/task-writer';

type ImportRollbackScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

type ImportMaintenanceScope = Pick<AppAdminAccessContext, 'isAppAdmin'> & {
  actorId: string;
};

const ROLLBACKABLE_STATUSES = new Set(['completed', 'needs_review', 'failed']);

export class ImportRollbackJobNotFoundError extends Error {
  constructor() {
    super('Import job not found');
    this.name = 'ImportRollbackJobNotFoundError';
  }
}

export class ImportRollbackStatusError extends Error {
  constructor(status: string) {
    super(`Job must be completed, needs_review, or failed to rollback. Current: ${status}`);
    this.name = 'ImportRollbackStatusError';
  }
}

export class ImportCommitJobNotFoundError extends Error {
  constructor() {
    super('Import job not found');
    this.name = 'ImportCommitJobNotFoundError';
  }
}

export class ImportCommitStatusError extends Error {
  constructor(status: string) {
    super(`Cannot commit a job with status '${status}'. Job must be approved first.`);
    this.name = 'ImportCommitStatusError';
  }
}

export class ImportCommitLoadError extends Error {
  constructor(message: string) {
    super(`Load failed: ${message}`);
    this.name = 'ImportCommitLoadError';
  }
}

/** Elevated ETL operations constrained to one already-authorized organization. */
export function createImportOrchestrationRepository(scope: ImportRollbackScope) {
  const db = createElevatedClient();

  async function requireJob(jobId: string) {
    const { data, error } = await db
      .from('import_jobs')
      .select('id, org_id, status')
      .eq('id', jobId)
      .eq('org_id', scope.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ImportCommitJobNotFoundError();
    return data;
  }

  return {
    async generateReconciliation(jobId: string) {
      await requireJob(jobId);
      // Production IDs are derived only from staging rows belonging to this verified job.
      return generateReconciliationReport(db, jobId);
    },

    async commit(jobId: string) {
      const currentJob = await requireJob(jobId);
      if (currentJob.status !== 'approved') {
        throw new ImportCommitStatusError(currentJob.status);
      }

      // Claim the approved job atomically so repeated requests cannot load it twice.
      const { data: claimedJob, error: claimError } = await db
        .from('import_jobs')
        .update({ status: 'committing' })
        .eq('id', jobId)
        .eq('org_id', scope.orgId)
        .eq('status', 'approved')
        .select('id, org_id, status')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimedJob) {
        const latest = await requireJob(jobId);
        throw new ImportCommitStatusError(latest.status);
      }

      let loadResults;
      try {
        loadResults = await loadStagingToProduction(db, jobId, { upsertMode: 'upsert' });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await db
          .from('import_jobs')
          .update({
            status: 'failed',
            error_message: message,
            error_details: {
              previous_status: 'approved',
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', jobId)
          .eq('org_id', scope.orgId)
          .eq('status', 'committing');
        throw new ImportCommitLoadError(message);
      }

      const totalInserted = loadResults.reduce(
        (sum, result) => sum + result.inserted + result.updated,
        0
      );
      const totalFailed = loadResults.reduce((sum, result) => sum + result.failed, 0);
      const loadSummary = {
        total_inserted: totalInserted,
        total_failed: totalFailed,
        phases: loadResults,
      };

      const { data: updatedJob, error: updateError } = await db
        .from('import_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          reviewed_by: scope.actorId,
          error_message: null,
          error_details: { load_summary: loadSummary },
        })
        .eq('id', jobId)
        .eq('org_id', scope.orgId)
        .eq('status', 'committing')
        .select('*')
        .single();
      if (updateError) throw updateError;

      completeGeneratedTasks(
        db,
        scope.orgId,
        `import_job:${jobId}:approval`,
        'Import job committed successfully'
      ).catch(() => {});

      return { job: updatedJob as ImportJob, load_summary: loadSummary };
    },
  };
}

/** Elevated rollback operations constrained to one already-authorized organization. */
export function createImportRollbackRepository(scope: ImportRollbackScope) {
  const db = createElevatedClient();

  return {
    async rollback(jobId: string, rollbackScope: RollbackScope) {
      const { data: job, error: jobError } = await db
        .from('import_jobs')
        .select('id, status')
        .eq('id', jobId)
        .eq('org_id', scope.orgId)
        .maybeSingle();

      if (jobError) throw jobError;
      if (!job) throw new ImportRollbackJobNotFoundError();
      if (!ROLLBACKABLE_STATUSES.has(job.status)) {
        throw new ImportRollbackStatusError(job.status);
      }

      const result = await rollbackImport(db, jobId, rollbackScope);
      const { data: updatedJob, error: updatedJobError } = await db
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('org_id', scope.orgId)
        .maybeSingle();

      if (updatedJobError) throw updatedJobError;
      if (!updatedJob) throw new ImportRollbackJobNotFoundError();

      return { result, job: updatedJob as ImportJob };
    },
  };
}

/** Global import maintenance available only after the app-admin guard succeeds. */
export function createAppAdminImportMaintenanceRepository(scope: ImportMaintenanceScope) {
  const db = createElevatedClient();

  return {
    async reapStaleJobs(staleThresholdMinutes: number) {
      if (!scope.isAppAdmin) throw new Error('App admin access required');
      return db.rpc('mark_stale_import_jobs', {
        p_stale_threshold_minutes: staleThresholdMinutes,
      });
    },

    async cleanupStagingPii(retentionDays: number) {
      if (!scope.isAppAdmin) throw new Error('App admin access required');
      return db.rpc('cleanup_staging_pii', { retention_days: retentionDays });
    },
  };
}

/** App-admin import mapping review data constrained to the selected job's organization. */
export function createAppAdminImportReviewRepository(scope: ImportMaintenanceScope) {
  const db = createElevatedClient();

  return {
    async loadMappingReview(jobId: string) {
      if (!scope.isAppAdmin) throw new Error('App admin access required');

      const { data: job, error: jobError } = await db
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job) return null;

      const importJob = job as ImportJob;
      let mappingProfile: MappingProfile | null = null;
      if (importJob.mapping_profile_id) {
        const { data: profile, error: profileError } = await db
          .from('import_mapping_profiles')
          .select('*')
          .eq('id', importJob.mapping_profile_id)
          .eq('org_id', importJob.org_id)
          .maybeSingle();
        if (profileError) throw profileError;
        mappingProfile = profile as MappingProfile | null;
      }

      if (!mappingProfile) {
        const { data: defaultProfile, error: defaultError } = await db
          .from('import_mapping_profiles')
          .select('*')
          .eq('org_id', importJob.org_id)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();
        if (defaultError) throw defaultError;
        mappingProfile = defaultProfile as MappingProfile | null;
      }

      const entityTypes = Object.keys(STAGING_TABLE_MAP) as Array<keyof typeof STAGING_TABLE_MAP>;
      const stagingPreviews = await Promise.all(
        entityTypes.map(async (entity) => {
          const table = STAGING_TABLE_MAP[entity];
          const { data: sampleRows, error: sampleError } = await fromImportStagingRelation(db, table)
            .select('raw_data')
            .eq('import_job_id', jobId)
            .limit(5);
          if (sampleError) throw sampleError;

          const { count, error: countError } = await fromImportStagingRelation(db, table)
            .select('*', { count: 'exact', head: true })
            .eq('import_job_id', jobId);
          if (countError) throw countError;

          const sourceFields = sampleRows?.[0]?.raw_data
            ? Object.keys(sampleRows[0].raw_data as Record<string, unknown>)
            : [];
          const sampleRecords = (sampleRows ?? []).map(
            (row: any) => row.raw_data as Record<string, unknown>
          );
          return { entity, sourceFields, sampleRecords, rowCount: count ?? 0 };
        })
      );

      return { importJob, mappingProfile, stagingPreviews };
    },
  };
}
