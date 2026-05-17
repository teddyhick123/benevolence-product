import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  transitionGrant,
  InvalidTransitionError,
  DecisionRequiredError,
  type LifecycleStage,
  type DecisionPayload,
} from '@/lib/grants/lifecycle';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { to_stage, reason, decision } = body as {
      to_stage: LifecycleStage;
      reason?: string;
      decision?: DecisionPayload;
    };

    if (!to_stage) {
      return NextResponse.json({ error: 'to_stage is required' }, { status: 400 });
    }

    await transitionGrant(grantId, to_stage, user.id, reason, decision);

    return NextResponse.json({ success: true, to_stage });
  } catch (err: any) {
    if (err instanceof InvalidTransitionError || err instanceof DecisionRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
