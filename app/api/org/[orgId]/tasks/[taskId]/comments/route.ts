import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { createTaskCommentSchema } from '@/lib/schemas/task';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = createTaskCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: task } = await adminClient
      .from('tasks')
      .select('id')
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const { data: comment, error } = await adminClient
      .from('task_comments')
      .insert({
        task_id: taskId,
        org_id: orgId,
        author_id: user.id,
        body: parsed.data.body,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'commented',
      after_values: comment,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
