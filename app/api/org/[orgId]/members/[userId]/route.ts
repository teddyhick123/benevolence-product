import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  MembershipRepositoryError,
  createMembershipRepository,
} from '@/lib/api/repositories/memberships';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { isOrgRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

function repositoryError(error: unknown) {
  if (error instanceof MembershipRepositoryError) return jsonError(error.message, error.status);
  const message = typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : 'Membership operation failed';
  return jsonError(message, 500);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId, userId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const { role } = await req.json().catch(() => ({}));
  if (!isOrgRole(role) || role === 'owner') return jsonError('Invalid role', 400);

  try {
    const member = await createMembershipRepository({
      orgId,
      role: access.context.role,
      actorId: access.context.principal.userId,
    }).updateRole(userId, role, false);
    return jsonOk(member);
  } catch (error) {
    return repositoryError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { orgId, userId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  try {
    await createMembershipRepository({
      orgId,
      role: access.context.role,
      actorId: access.context.principal.userId,
    }).remove(userId);
    return jsonOk({ success: true });
  } catch (error) {
    return repositoryError(error);
  }
}
