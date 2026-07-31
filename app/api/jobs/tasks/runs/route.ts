// app/api/jobs/tasks/runs/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess, requireOrgAccess } from '@/lib/api/access';
import {
  createTaskJobRepository,
  listOrgTaskRuns,
} from '@/lib/api/repositories/task-jobs';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const org_id = searchParams.get('org_id') ?? undefined;
  const producer = searchParams.get('producer') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200);

  const jobAccess = requireJobAccess(req, 'tasks');
  let result;

  if (!isAccessDenied(jobAccess)) {
    result = await createTaskJobRepository(jobAccess.context).listRuns({
      orgId: org_id,
      producer,
      limit,
    });
  } else {
    if (!org_id) return jobAccess.response;

    const orgAccess = await requireOrgAccess(org_id, 'admin');
    if (isAccessDenied(orgAccess)) return orgAccess.response;

    result = await listOrgTaskRuns(orgAccess.context.db, org_id, {
      producer,
      limit,
    });
  }

  const { data: runs, error } = result;

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ runs: runs ?? [] });
}
