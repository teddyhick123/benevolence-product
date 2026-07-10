import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';
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

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const access = await getOrgAccess(supabase, orgId);
    if (!access.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasOrgAccess(access, 'member')) return json({ error: 'Member access required' }, { status: 403 });
    const { user } = access;

    const body = await req.json();
    const { to_stage, reason, decision } = body as {
      to_stage: LifecycleStage;
      reason?: string;
      decision?: DecisionPayload;
    };

    if (!to_stage) {
      return json({ error: 'to_stage is required' }, { status: 400 });
    }

    await transitionGrant(grantId, to_stage, user.id, reason, decision, orgId);

    return json({ success: true, to_stage });
  } catch (err: any) {
    if (err instanceof WorkflowGateBlockedError) {
      return json({ error: err.message, blocking_items: err.reasons }, { status: 422 });
    }
    if (err instanceof InvalidTransitionError || err instanceof DecisionRequiredError) {
      return json({ error: err.message }, { status: 422 });
    }
    if (err instanceof GrantNotFoundError) {
      return json({ error: err.message }, { status: 404 });
    }
    if (err instanceof GrantTransitionConflictError) {
      return json({ error: err.message }, { status: 409 });
    }
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
