// POST /api/admin/imports/watchdog
// Manually trigger stale job check (admin only)
// Returns: { reaped: number }
import { requireAppAdmin } from '@/lib/api/access';
import { createAppAdminImportMaintenanceRepository } from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';

const STALE_THRESHOLD_MINUTES = 30;

function isMissingStaleJobRpc(message: string): boolean {
  return message.includes('mark_stale_import_jobs') && message.includes('schema cache');
}

export async function POST() {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const repository = createAppAdminImportMaintenanceRepository({
    isAppAdmin: access.context.isAppAdmin,
    actorId: access.context.user.id,
  });
  const { data, error } = await repository.reapStaleJobs(STALE_THRESHOLD_MINUTES);
  if (error) {
    return jsonError(
      error.message,
      isMissingStaleJobRpc(error.message) ? 501 : 500,
      {
        hint: isMissingStaleJobRpc(error.message)
          ? 'Apply db/migrations/0018_import_system.sql or run scripts/run-migrations.sh.'
          : undefined,
      }
    );
  }
  return jsonOk({ reaped: data ?? 0 });
}
