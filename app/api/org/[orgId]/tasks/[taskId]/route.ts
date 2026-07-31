import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  TaskRepositoryError,
  createOrgTaskRepository,
} from '@/lib/api/repositories/tasks';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { updateTaskSchema } from '@/lib/schemas/task';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

function repositoryFor(access: Exclude<Awaited<ReturnType<typeof requireOrgAccess>>, { ok: false }>) {
  return createOrgTaskRepository({
    orgId: access.context.orgId,
    role: access.context.role,
    actorId: access.context.principal.userId,
  });
}

function repositoryError(error: unknown) {
  if (error instanceof TaskRepositoryError) return jsonError(error.message, error.status);
  return jsonError(error instanceof Error ? error.message : 'Task operation failed', 500);
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId, taskId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const task = await repositoryFor(access).get(taskId);
    if (!task) return jsonError('Task not found', 404);
    return jsonOk({ task, currentRole: access.context.role });
  } catch (error) {
    return repositoryError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId, taskId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  const parsed = updateTaskSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  try {
    const task = await repositoryFor(access).update(taskId, parsed.data);
    return jsonOk({ task });
  } catch (error) {
    return repositoryError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { orgId, taskId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    await repositoryFor(access).remove(taskId);
    return jsonOk({ success: true });
  } catch (error) {
    return repositoryError(error);
  }
}
