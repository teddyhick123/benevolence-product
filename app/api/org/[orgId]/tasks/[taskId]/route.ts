import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { updateTaskSchema } from '@/lib/schemas/task';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';

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

async function assertPortfolioInOrg(portfolioId: string | null | undefined, orgId: string) {
  if (!portfolioId) return true;
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  return !!data;
}

async function assertUserInOrg(userId: string | null | undefined, orgId: string) {
  if (!userId) return true;
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return !!data;
}

async function loadTask(orgId: string, taskId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('tasks')
    .select('*, task_entity_links(id, entity_type, entity_id, relationship), task_comments(id, body, author_id, created_at)')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function editableFieldsForAssignee(input: Record<string, any>) {
  const allowed = new Set(['status', 'metadata']);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
}

function withCompletionFields(updates: Record<string, any>, userId: string) {
  if (updates.status === 'completed') {
    return {
      ...updates,
      completed_at: new Date().toISOString(),
      completed_by: userId,
    };
  }

  if (updates.status && updates.status !== 'completed') {
    return {
      ...updates,
      completed_at: null,
      completed_by: null,
    };
  }

  return updates;
}

function eventTypeForUpdates(updates: Record<string, any>) {
  if (updates.status === 'completed') return 'completed';
  if (updates.status === 'cancelled') return 'cancelled';
  if (updates.assigned_to) return 'assigned';
  if (updates.due_at || updates.starts_at) return 'due_date_changed';
  return 'status_changed';
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const task = await loadTask(orgId, taskId);
    if (!task) return json({ error: 'Task not found' }, { status: 404 });

    return json({ task, currentRole: role });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const existing = await loadTask(orgId, taskId);
    if (!existing) return json({ error: 'Task not found' }, { status: 404 });

    const isAdmin = ADMIN_ROLES.has(role);
    const isAssignee = existing.assigned_to === user.id;
    if (!isAdmin && !isAssignee) {
      return json({ error: 'Not authorized to update this task' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    let updates = parsed.data as Record<string, any>;
    if (!isAdmin) updates = editableFieldsForAssignee(updates);
    if (Object.keys(updates).length === 0) {
      return json({ error: 'No valid fields to update' }, { status: 400 });
    }
    if (!(await assertPortfolioInOrg(updates.portfolio_id, orgId))) {
      return json({ error: 'Portfolio does not belong to this organization' }, { status: 400 });
    }
    if (!(await assertUserInOrg(updates.assigned_to, orgId))) {
      return json({ error: 'Assignee is not a member of this organization' }, { status: 400 });
    }
    updates = withCompletionFields(updates, user.id);

    const adminClient = createAdminClient();
    const { data: task, error } = await adminClient
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });

    const { error: eventError } = await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: eventTypeForUpdates(updates),
      before_values: existing,
      after_values: task,
    });
    if (eventError) {
      await adminClient
        .from('tasks')
        .update({
          title: existing.title,
          description: existing.description,
          status: existing.status,
          priority: existing.priority,
          task_type: existing.task_type,
          portfolio_id: existing.portfolio_id,
          starts_at: existing.starts_at,
          due_at: existing.due_at,
          assigned_to: existing.assigned_to,
          metadata: existing.metadata,
          completed_at: existing.completed_at,
          completed_by: existing.completed_by,
        })
        .eq('id', taskId)
        .eq('org_id', orgId);
      return json({ error: eventError.message }, { status: 500 });
    }

    if (updates.status === 'completed') {
      try {
        await runAutomationRulesForEvent(adminClient, {
          orgId,
          triggerType: 'task_completed',
          entityType: 'task',
          entityId: taskId,
          payload: {
            task_type: task.task_type,
            assigned_to: task.assigned_to,
            actor_id: user.id,
          },
        });
      } catch (automationErr) {
        console.error('Task completion automation failed:', automationErr);
      }
    }

    return json({ task });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: deleted, error } = await adminClient
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) return json({ error: error.message }, { status: 500 });
    if (!deleted) return json({ error: 'Task not found' }, { status: 404 });

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
