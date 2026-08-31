import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string; runId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId, runId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();

  try {
    const run = await createOrgExportRepository(db).getRun(runId);
    if (!run) return jsonError('Export run not found', 404);

    // The guard proved admin access to orgId, not to this run. Without this a
    // run id from another organization would be readable by anyone who
    // administers any organization.
    if (run.org_id !== orgId) return jsonError('Export run not found', 404);

    if (run.status !== 'succeeded' || !run.storage_path) {
      return jsonOk({ run });
    }

    const { data, error } = await db.storage
      .from('org-exports')
      .createSignedUrl(run.storage_path, 3600);
    if (error) throw error;

    return jsonOk({ run, signed_url: data?.signedUrl ?? null });
  } catch {
    return jsonError('Export run could not be loaded', 502);
  }
}
