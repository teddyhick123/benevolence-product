// app/api/org/[orgId]/notifications/route.ts
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'unread';
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '30', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 30;
    const cursor = searchParams.get('cursor');

    if (!['unread', 'read', 'all'].includes(status)) {
      return json({ error: 'Invalid notification status' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not a member of this organization' }, { status: 403 });

    const db = createAdminClient();

    let query = db
      .from('notification_events')
      .select('id, event_type, priority, task_id, payload, read_at, created_at, channel, status')
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (status === 'unread') {
      query = query.is('read_at', null).not('status', 'in', '(suppressed,cancelled)');
    } else if (status === 'read') {
      query = query.not('read_at', 'is', null);
    }

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const hasMore = (data?.length ?? 0) > limit;
    const rows = hasMore ? data!.slice(0, limit) : (data ?? []);
    const nextCursor = hasMore ? rows[rows.length - 1].created_at : null;

    const { count } = await db
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .is('read_at', null)
      .not('status', 'in', '(suppressed,cancelled)');

    return json({
      data: rows.map((n: any) => ({
        id: n.id,
        event_type: n.event_type,
        priority: n.priority,
        task_id: n.task_id,
        title: n.payload?.title ?? '',
        body: n.payload?.body ?? '',
        href: n.payload?.href ?? '/dashboard',
        read_at: n.read_at,
        created_at: n.created_at,
      })),
      unread_count: count ?? 0,
      next_cursor: nextCursor,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
