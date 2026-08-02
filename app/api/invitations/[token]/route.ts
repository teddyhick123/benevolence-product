import { NextRequest } from 'next/server';
import { isAccessDenied, requireInvitationToken } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// GET /api/invitations/[token] — validate token (public, no user auth required)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const access = await requireInvitationToken(token);
  if (isAccessDenied(access)) {
    if (access.reason === 'not_found') {
      return jsonOk({ valid: false, reason: 'not_found' }, { status: 404 });
    }
    return access.response;
  }

  const invitation = access.context;
  if (invitation.status === 'accepted') {
    return jsonOk({ valid: false, reason: 'already_accepted' });
  }
  if (invitation.status === 'cancelled') {
    return jsonOk({ valid: false, reason: 'cancelled' });
  }

  try {
    if (new Date(invitation.expiresAt) < new Date()) {
      await invitation.repository.markExpired();
      return jsonOk({ valid: false, reason: 'expired' });
    }
    if (invitation.status === 'expired') {
      return jsonOk({ valid: false, reason: 'expired' });
    }

    const orgName = await invitation.repository.organizationName();
    return jsonOk({
      valid: true,
      invitation: {
        id: invitation.principal.invitationId,
        email: invitation.email,
        role: invitation.role,
        orgName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
