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
  params: Promise<{ orgId: string }>;
}

function repositoryFor(access: Exclude<Awaited<ReturnType<typeof requireOrgAccess>>, { ok: false }>) {
  return createMembershipRepository({
    orgId: access.context.orgId,
    role: access.context.role,
    actorId: access.context.principal.userId,
  });
}

function repositoryError(error: unknown) {
  if (error instanceof MembershipRepositoryError) return jsonError(error.message, error.status);
  const message = typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : 'Membership operation failed';
  return jsonError(message, 500);
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const members = await repositoryFor(access).list();
    return jsonOk({ members, currentRole: access.context.role });
  } catch (error) {
    return repositoryError(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const { email, user_id: userId, role } = await req.json().catch(() => ({}));
  if (!isOrgRole(role)) return jsonError('Invalid role', 400);

  try {
    const member = await repositoryFor(access).add({ email, userId, role });
    return jsonOk(member, { status: 201 });
  } catch (error) {
    return repositoryError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const { user_id: userId, role } = await req.json().catch(() => ({}));
  if (!userId) return jsonError('user_id is required', 400);
  if (!isOrgRole(role)) return jsonError('Invalid role', 400);

  try {
    const member = await repositoryFor(access).updateRole(userId, role, true);
    return jsonOk(member);
  } catch (error) {
    return repositoryError(error);
  }
}
