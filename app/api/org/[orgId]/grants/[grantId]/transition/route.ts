import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  transitionGrant,
  InvalidTransitionError,
  DecisionRequiredError,
  GrantNotFoundError,
  GrantTransitionConflictError,
  WorkflowGateBlockedError,
  type LifecycleStage,
  type DecisionPayload,
} from '@/lib/grants/lifecycle';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const { user } = access.context;

    const body = await req.json();
    const { to_stage, reason, decision } = body as {
      to_stage: LifecycleStage;
      reason?: string;
      decision?: DecisionPayload;
    };

    if (!to_stage) {
      return jsonError('to_stage is required', 400);
    }

    await transitionGrant(grantId, to_stage, user.id, reason, decision, orgId);

    return jsonOk({ success: true, to_stage });
  } catch (err: unknown) {
    if (err instanceof WorkflowGateBlockedError) {
      return jsonError(err.message, 422, { blocking_items: err.reasons });
    }
    if (err instanceof InvalidTransitionError || err instanceof DecisionRequiredError) {
      return jsonError(err.message, 422);
    }
    if (err instanceof GrantNotFoundError) {
      return jsonError(err.message, 404);
    }
    if (err instanceof GrantTransitionConflictError) {
      return jsonError(err.message, 409);
    }
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
