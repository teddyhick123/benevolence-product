import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createInvitationRepository, InvitationRepositoryError } from '@/lib/api/repositories/invitations';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';
interface RouteParams { params: Promise<{ orgId: string; inviteId: string }> }

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { orgId, inviteId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    await createInvitationRepository({ orgId, role: access.context.role, actorId: access.context.principal.userId }).resend(inviteId);
    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof InvitationRepositoryError) return jsonError(error.message, error.status);
    const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Invitation resend failed';
    return jsonError(message, 500);
  }
}
