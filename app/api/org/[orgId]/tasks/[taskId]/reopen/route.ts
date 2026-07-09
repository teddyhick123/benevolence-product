import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) return json({ error: 'Task not found' }, { status: 404 });
    if (!ADMIN_ROLES.has(role) && existing.assigned_to !== user.id) {
      return json({ error: 'Not authorized to reopen this task' }, { status: 403 });
    }

    if (existing.status === 'open') {
      return json({ task: existing, idempotent: true });
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .update({
        status: 'open',
        completed_at: null,
        completed_by: null,
      })
      .eq('id', taskId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });

    const { error: eventError } = await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'status_changed',
      before_values: existing,
      after_values: task,
    });
    if (eventError) {
      await adminClient
        .from('tasks')
        .update({
          status: existing.status,
          completed_at: existing.completed_at,
          completed_by: existing.completed_by,
        })
        .eq('id', taskId)
        .eq('org_id', orgId);
      return json({ error: eventError.message }, { status: 500 });
    }

    return json({ task });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
