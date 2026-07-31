import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  WorkflowTaskMutationError,
  createWorkflowTaskRepository,
} from '@/lib/api/repositories/workflows';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { updateWorkflowTaskSchema } from '@/lib/schemas/workflow';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; workflowId: string; workflowTaskId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, workflowId, workflowTaskId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const parsed = updateWorkflowTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Validation failed', 400, {
        details: parsed.error.format(),
      });
    }

    const repository = createWorkflowTaskRepository({
      orgId,
      role: access.context.role,
      actorId: access.context.principal.userId,
    });
    const workflowTask = await repository.updateWorkflowTask({
      workflowId,
      workflowTaskId,
      updates: parsed.data,
    });
    return jsonOk({ workflowTask });
  } catch (error: any) {
    if (error instanceof WorkflowTaskMutationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(error.message, 500);
  }
}
