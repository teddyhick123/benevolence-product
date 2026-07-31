import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  TaskRepositoryError,
  createOrgTaskRepository,
} from '@/lib/api/repositories/tasks';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { orgId, taskId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    const result = await createOrgTaskRepository({
      orgId,
      role: access.context.role,
      actorId: access.context.principal.userId,
    }).complete(taskId);
    return jsonOk(result.idempotent ? result : { task: result.task });
  } catch (error) {
    if (error instanceof TaskRepositoryError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Task completion failed', 500);
  }
}
