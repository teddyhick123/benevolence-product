import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  TaskRepositoryError,
  createOrgTaskRepository,
} from '@/lib/api/repositories/tasks';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createTaskCommentSchema } from '@/lib/schemas/task';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId, taskId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  const parsed = createTaskCommentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  try {
    const comment = await createOrgTaskRepository({
      orgId,
      role: access.context.role,
      actorId: access.context.principal.userId,
    }).addComment(taskId, parsed.data.body);
    return jsonOk({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskRepositoryError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Task comment failed', 500);
  }
}
