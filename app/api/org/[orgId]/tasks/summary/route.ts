import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

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

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const db = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const sevenDaysIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const notDone = '(completed,cancelled)';

    const [overdueRes, dueSoonRes, blockedRes, mineRes, openRes] = await Promise.all([
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).lt('due_at', nowIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).gte('due_at', nowIso).lte('due_at', sevenDaysIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('status', 'blocked').is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('assigned_to', user.id).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).not('status', 'in', notDone).is('deleted_at', null),
    ]);

    const firstError = [overdueRes, dueSoonRes, blockedRes, mineRes, openRes].find(r => r.error);
    if (firstError?.error) {
      return json({ error: firstError.error.message }, { status: 500 });
    }

    return json({
      overdue:    overdueRes.count  ?? 0,
      due_soon:   dueSoonRes.count  ?? 0,
      blocked:    blockedRes.count  ?? 0,
      mine:       mineRes.count     ?? 0,
      total_open: openRes.count     ?? 0,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
