import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { createTaskCommentSchema } from '@/lib/schemas/task';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
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
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const access = await getOrgAccess(supabase, orgId);
    if (!access.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasOrgAccess(access, 'member')) return json({ error: 'Member access required' }, { status: 403 });
    const { user } = access;

    const body = await req.json().catch(() => ({}));
    const parsed = createTaskCommentSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: task } = await adminClient
      .from('tasks')
      .select('id')
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!task) return json({ error: 'Task not found' }, { status: 404 });

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

    if (error) return json({ error: error.message }, { status: 500 });

    const { error: eventError } = await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'commented',
      after_values: comment,
    });
    if (eventError) {
      await adminClient.from('task_comments').delete().eq('id', comment.id).eq('org_id', orgId);
      return json({ error: eventError.message }, { status: 500 });
    }

    return json({ comment }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
