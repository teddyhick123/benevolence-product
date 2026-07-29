import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { rollbackImport, type RollbackScope } from '@/lib/import/rollback';
import type { ImportJob } from '@/lib/import/types';

type ImportRollbackScope = Pick<OrgAccessContext, 'orgId'> & {
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
