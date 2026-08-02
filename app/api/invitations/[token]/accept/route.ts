import { NextRequest } from 'next/server';
import {
  isAccessDenied,
  requireInvitationToken,
  requireUserAccess,
} from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// POST /api/invitations/[token]/accept — accept invitation (user auth required)
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const userAccess = await requireUserAccess();
  if (isAccessDenied(userAccess)) return userAccess.response;

  const { token } = await params;
  const invitationAccess = await requireInvitationToken(token);
  if (isAccessDenied(invitationAccess)) return invitationAccess.response;

  const invitation = invitationAccess.context;
  if (invitation.status !== 'pending') {
    return jsonError(`Invitation is ${invitation.status}`, 409);
  }

  try {
    if (new Date(invitation.expiresAt) < new Date()) {
      await invitation.repository.markExpired();
      return jsonError('Invitation has expired', 410);
    }

    const userEmail = userAccess.context.user.email?.trim().toLowerCase();
    const invitationEmail = invitation.email.trim().toLowerCase();
    if (!userEmail || userEmail !== invitationEmail) {
      return jsonError('Invitation is tied to a different email', 403);
    }

    const orgId = await invitation.repository.accept(userAccess.context.principal.userId);
    return jsonOk({ success: true, orgId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
