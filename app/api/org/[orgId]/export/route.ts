import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { enqueueExport } from '@/lib/export/queue';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  const repo = createOrgExportRepository(db);
  const actorId = access.context.user.id;

  try {
    const run = await repo.createRun(orgId, actorId);

    // Written as soon as the run exists: an export that later fails still
    // happened, and who asked for it is the fact worth keeping after the
    // archive is deleted.
    await db.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: actorId,
      action: 'org.data_exported',
      target_id: run.id,
      metadata: { run_id: run.id },
    });

    await enqueueExport({ runId: run.id, orgId });
    return jsonOk({ run }, { status: 202 });
  } catch (err) {
    // The unique partial index is what rejects a second live run.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return jsonError('An export is already running for this organization', 409);
    }
    return jsonError('Export could not be started', 502);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  try {
    const runs = await createOrgExportRepository().listRuns(orgId);
    return jsonOk({ runs });
  } catch {
    return jsonError('Export history could not be loaded', 502);
  }
}
