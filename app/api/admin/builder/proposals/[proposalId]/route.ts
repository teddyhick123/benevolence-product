// app/api/admin/builder/proposals/[proposalId]/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminBuilderRepository } from '@/lib/api/repositories/builder';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { proposalId } = await params;
    const access = await requireAppAdmin();
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const { status, reviewer_notes } = body as { status?: string; reviewer_notes?: string };

    const result = await createAppAdminBuilderRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).reviewProposal({ proposalId, status, reviewerNotes: reviewer_notes });

    if (!result.ok) {
      if (result.reason === 'not_found') return jsonError('Proposal not found', 404);
      if (result.reason === 'code_action_not_allowed') {
        return jsonError(
          'Code proposals may only be rejected here; approval and apply happen via the org-scoped apply route.',
          400
        );
      }
      if (result.reason === 'invalid_config_status') {
        return jsonError('status must be one of: approved, rejected, applied', 400);
      }
      if (result.reason === 'missing_code_state') {
        return jsonError('Proposal has no code state to transition', 409);
      }
      return jsonError(
        `Cannot reject a proposal in state: ${result.currentState}`,
        409,
        { currentState: result.currentState }
      );
    }

    return jsonOk({ proposal: result.proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
