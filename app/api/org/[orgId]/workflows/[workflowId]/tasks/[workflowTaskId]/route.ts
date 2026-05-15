import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { updateWorkflowTaskSchema } from '@/lib/schemas/workflow';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; workflowId: string; workflowTaskId: string }>;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

function taskStatusForWorkflowStatus(status?: string) {
  if (status === 'completed') return 'completed';
  if (status === 'skipped') return 'cancelled';
  if (status === 'blocked') return 'blocked';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

async function maybeCompleteWorkflow(adminClient: ReturnType<typeof createAdminClient>, workflowId: string) {
  const { data: remaining } = await adminClient
    .from('workflow_tasks')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('is_required', true)
    .not('status', 'in', '(completed,skipped)')
    .limit(1);

  if ((remaining || []).length === 0) {
    await adminClient
      .from('workflow_instances')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', workflowId);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, workflowId, workflowTaskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const parsed = updateWorkflowTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: existing, error: loadError } = await adminClient
      .from('workflow_tasks')
      .select('*, tasks(id, assigned_to), workflow_instances!inner(id, org_id, status)')
      .eq('id', workflowTaskId)
      .eq('workflow_id', workflowId)
      .eq('workflow_instances.org_id', orgId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) return NextResponse.json({ error: 'Workflow task not found' }, { status: 404 });

    const linkedTask = Array.isArray(existing.tasks) ? existing.tasks[0] : existing.tasks;
    const isAdmin = ADMIN_ROLES.has(role);
    const isAssignee = linkedTask?.assigned_to === user.id;
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: 'Not authorized to update this workflow task' }, { status: 403 });
    }

    const updates: Record<string, any> = { ...parsed.data };
    if (updates.status === 'completed') {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = user.id;
    } else if (updates.status && updates.status !== 'completed') {
      updates.completed_at = null;
      updates.completed_by = null;
    }

    const { data: workflowTask, error: updateError } = await adminClient
      .from('workflow_tasks')
      .update(updates)
      .eq('id', workflowTaskId)
      .eq('workflow_id', workflowId)
      .select()
      .single();

    if (updateError) throw updateError;

    if (workflowTask.task_id && updates.status) {
      const taskUpdates: Record<string, any> = {
        status: taskStatusForWorkflowStatus(updates.status),
      };
      if (updates.status === 'completed') {
        taskUpdates.completed_at = updates.completed_at;
        taskUpdates.completed_by = user.id;
      } else {
        taskUpdates.completed_at = null;
        taskUpdates.completed_by = null;
      }

      const { data: task } = await adminClient
        .from('tasks')
        .update(taskUpdates)
        .eq('id', workflowTask.task_id)
        .eq('org_id', orgId)
        .select()
        .single();

      await adminClient.from('task_events').insert({
        task_id: workflowTask.task_id,
        org_id: orgId,
        actor_id: user.id,
        event_type: updates.status === 'completed' ? 'completed' : 'status_changed',
        before_values: linkedTask || null,
        after_values: task || null,
      });
    }

    if (updates.status === 'completed' || updates.status === 'skipped') {
      await maybeCompleteWorkflow(adminClient, workflowId);
    }

    return NextResponse.json({ workflowTask });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
