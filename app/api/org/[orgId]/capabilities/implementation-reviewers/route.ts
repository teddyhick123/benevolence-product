import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import {
  ImplementationReviewerRepositoryError,
  createImplementationReviewerRepository,
} from '@/lib/api/repositories/implementation-reviewers';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { isOrgRole, isWorkspaceManager } from '@/lib/organizations/roles';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

async function getActor(orgId: string) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access;

  const [{ data: rawRole }, { data: isAppAdmin }] = await Promise.all([
    access.context.db.rpc('user_org_role', { p_org_id: orgId }),
    access.context.db.rpc('is_app_admin'),
  ]);

  return {
    ok: true as const,
    context: {
      ...access.context,
      orgId,
      role: isOrgRole(rawRole) ? rawRole : null,
      isAppAdmin: isAppAdmin === true,
    },
  };
}

function failure(error: unknown) {
  if (error instanceof ImplementationReviewerRepositoryError) {
    return jsonError(error.message, error.status);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return jsonError(message, 500);
}

function repositoryFor(actor: Awaited<ReturnType<typeof getActor>> & { ok: true }) {
  return createImplementationReviewerRepository({
    orgId: actor.context.orgId,
    actorId: actor.context.principal.userId,
  });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const actor = await getActor(orgId);
  if (isAccessDenied(actor)) return actor.response;
  if (!actor.context.role && !actor.context.isAppAdmin) {
    return jsonError('Forbidden', 403);
  }
  if (!isWorkspaceManager(actor.context.role) && !actor.context.isAppAdmin) {
    return jsonError('Only organization admins can view implementation reviewer access', 403);
  }

  try {
    const reviewers = await repositoryFor(actor).list();
    return jsonOk({
      reviewers,
      canManage: actor.context.role === 'owner' || actor.context.isAppAdmin,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const actor = await getActor(orgId);
  if (isAccessDenied(actor)) return actor.response;
  if (actor.context.role !== 'owner' && !actor.context.isAppAdmin) {
    return jsonError('Only organization owners can grant implementation reviewer access', 403);
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!userId) return jsonError('user_id is required', 400);

  try {
    const reviewers = await repositoryFor(actor).grant(userId);
    return jsonOk({ reviewers, canManage: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const actor = await getActor(orgId);
  if (isAccessDenied(actor)) return actor.response;
  if (actor.context.role !== 'owner' && !actor.context.isAppAdmin) {
    return jsonError('Only organization owners can revoke implementation reviewer access', 403);
  }

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return jsonError('user_id is required', 400);

  try {
    const reviewers = await repositoryFor(actor).revoke(userId);
    return jsonOk({ reviewers, canManage: true });
  } catch (error) {
    return failure(error);
  }
}
