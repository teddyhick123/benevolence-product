import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { CancelPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!['owner','admin'].includes(role)) return json({ error: 'Admin required' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = CancelPledgeSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const adminDb = createAdminClient();
    const { data, error } = await adminDb.rpc('cancel_pledge_with_obligations', {
      p_org_id: orgId,
      p_pledge_id: pledgeId,
      p_actor_id: user.id,
      p_cancellation_reason: parsed.data.cancellation_reason ?? null,
      p_waive_pending: parsed.data.waive_pending ?? false,
    });

    if (error) return json({ error: error.message }, { status: 500 });

    return json({ success: true, ...data });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
