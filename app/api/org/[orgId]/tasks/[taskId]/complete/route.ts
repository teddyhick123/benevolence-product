import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (!ADMIN_ROLES.has(role) && existing.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Not authorized to complete this task' }, { status: 403 });
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      })
      .eq('id', taskId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'completed',
      before_values: existing,
      after_values: task,
    });

    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
