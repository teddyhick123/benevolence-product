// app/api/admin/imports/[id]/commit/route.ts
// POST: load staging data into production tables for an approved job.

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import {
  createAppAdminImportMaintenanceRepository,
  createImportOrchestrationRepository,
  ImportCommitJobNotFoundError,
  ImportCommitLoadError,
  ImportCommitStatusError,
} from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { data: job, error: jobError } = await access.context.db
    .from('import_jobs')
    .select('id, org_id')
    .eq('id', id)
    .maybeSingle();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  try {
    const repository = createImportOrchestrationRepository({
      orgId: job.org_id,
      actorId: access.context.user.id,
    });
    const result = await repository.commit(id);

    const maintenance = createAppAdminImportMaintenanceRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    });
    maintenance.cleanupStagingPii(30).catch(() => {});

    return jsonOk(result);
  } catch (error: unknown) {
    if (error instanceof ImportCommitJobNotFoundError) return jsonError(error.message, 404);
    if (error instanceof ImportCommitStatusError) return jsonError(error.message, 422);
    if (error instanceof ImportCommitLoadError) return jsonError(error.message, 500);
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
