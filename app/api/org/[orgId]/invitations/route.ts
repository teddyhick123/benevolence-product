import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createInvitationRepository, InvitationRepositoryError } from '@/lib/api/repositories/invitations';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createInvitationSchema } from '@/lib/schemas/invitations';

export const dynamic = 'force-dynamic';
interface RouteParams { params: Promise<{ orgId: string }> }

function failure(error: unknown) {
  if (error instanceof InvitationRepositoryError) return jsonError(error.message, error.status);
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Invitation operation failed';
  return jsonError(message, 500);
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    const invitations = await createInvitationRepository({ orgId, role: access.context.role, actorId: access.context.principal.userId }).list();
    return jsonOk({ invitations });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const validation = createInvitationSchema.safeParse(await req.json().catch(() => ({})));
  if (!validation.success) return jsonError('Validation failed', 400, { details: validation.error.format() });
  try {
    const result = await createInvitationRepository({ orgId, role: access.context.role, actorId: access.context.principal.userId }).create(validation.data);
    if (!result.created) return jsonOk({ invitation: result.invitation, warning: 'A pending invitation already exists for this email.' });
    return jsonOk({ invitation: result.invitation }, { status: 201 });
  } catch (error) { return failure(error); }
}
