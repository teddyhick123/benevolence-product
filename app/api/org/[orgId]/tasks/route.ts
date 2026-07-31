import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  TaskRepositoryError,
  createOrgTaskRepository,
} from '@/lib/api/repositories/tasks';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createTaskSchema } from '@/lib/schemas/task';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function repositoryFor(access: Awaited<ReturnType<typeof requireOrgAccess>>) {
  if (isAccessDenied(access)) throw new Error('Access must be granted');
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

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  const { searchParams } = new URL(req.url);
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '100', 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 200)
    : 100;

  try {
    const tasks = await repositoryFor(access).list({
      tab: searchParams.get('tab') || 'all',
      status: searchParams.get('status') ?? undefined,
      priority: searchParams.get('priority') ?? undefined,
      assignedTo: searchParams.get('assigned_to') ?? undefined,
      entityType: searchParams.get('entity_type') ?? undefined,
      limit,
    });
    return jsonOk({ tasks, currentRole: access.context.role });
  } catch (error) {
    return repositoryError(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  const parsed = createTaskSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('Validation failed', 400, { details: parsed.error.format() });
  }

  try {
    const task = await repositoryFor(access).create(parsed.data);
    return jsonOk({ task }, { status: 201 });
  } catch (error) {
    return repositoryError(error);
  }
}
