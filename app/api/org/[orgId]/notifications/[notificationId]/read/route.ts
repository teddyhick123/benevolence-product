// app/api/org/[orgId]/notifications/[notificationId]/read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

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

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; notificationId: string }> }
) {
  try {
    const { orgId, notificationId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not a member' }, { status: 403 });

    const db = createAdminClient();
    const { error } = await db
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_user_id', user.id)
      .eq('org_id', orgId)
      .is('read_at', null);

    if (error) throw error;
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
