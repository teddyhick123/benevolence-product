import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { createTaskSchema } from '@/lib/schemas/task';
import { TASK_ENTITY_TYPES } from '@/lib/tasks/automation/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ADMIN_ROLES = new Set(['owner', 'admin']);
const DIRECT_ORG_ENTITY_TABLES: Record<string, string> = {
  filing: 'compliance_filings',
  state_registration: 'state_registrations',
  pledge_installment: 'pledge_installments',
  pledge: 'pledges',
  donor: 'donors',
  grant: 'grants',
  holding: 'holdings',
  portfolio: 'portfolios',
  import_job: 'import_jobs',
  workflow_instance: 'workflow_instances',
};
const GRANT_CHILD_ENTITY_TABLES: Record<string, string> = {
  grant_milestone: 'grant_milestones',
  grant_report: 'grant_reports',
  grant_payment: 'grant_payments',
};

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

function normalizeTask(task: any, profilesById: Map<string, any>) {
  return {
    ...task,
    assignee: task.assigned_to ? profilesById.get(task.assigned_to) ?? null : null,
    creator: task.created_by ? profilesById.get(task.created_by) ?? null : null,
  };
}

async function loadProfiles(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, any>();

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('profiles')
    .select('id, email, full_name, avatar_url')
    .in('id', ids);

  return new Map((data || []).map((profile: any) => [profile.id, profile]));
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

async function assertEntityLinkInOrg(
  adminClient: ReturnType<typeof createAdminClient>,
  orgId: string,
  link: { entity_type: string; entity_id: string }
) {
  if (!TASK_ENTITY_TYPES.includes(link.entity_type as any)) return false;

  const directTable = DIRECT_ORG_ENTITY_TABLES[link.entity_type];
  if (directTable) {
    const { data, error } = await adminClient
      .from(directTable)
      .select('id')
      .eq('id', link.entity_id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  const grantChildTable = GRANT_CHILD_ENTITY_TABLES[link.entity_type];
  if (grantChildTable) {
    const { data, error } = await adminClient
      .from(grantChildTable)
      .select('id, grants!inner(org_id)')
      .eq('id', link.entity_id)
      .eq('grants.org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  return false;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'all';
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assigned_to');
    const entityType = searchParams.get('entity_type');
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 100;

    const adminClient = createAdminClient();
    let query = adminClient
      .from('tasks')
      .select(`
        *,
        task_entity_links(id, entity_type, entity_id, relationship)
      `)
      .eq('org_id', orgId)
      .is('deleted_at', null);

    if (tab === 'mine') query = query.eq('assigned_to', user.id);
    if (tab === 'approvals') query = query.eq('task_type', 'approval').not('status', 'in', '(completed,cancelled)');
    if (tab === 'overdue') query = query.lt('due_at', new Date().toISOString()).not('status', 'in', '(completed,cancelled)');
    if (tab === 'open') query = query.not('status', 'in', '(completed,cancelled)');
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data, error } = await query
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return json({ error: error.message }, { status: 500 });

    let tasks = data || [];
    if (tab === 'due_soon') {
      const now = Date.now();
      const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
      tasks = tasks.filter((task: any) => {
        if (!task.due_at || ['completed', 'cancelled'].includes(task.status)) return false;
        const due = new Date(task.due_at).getTime();
        return due >= now && due <= sevenDays;
      });
    }
    if (entityType) {
      tasks = tasks.filter((task: any) =>
        (task.task_entity_links || []).some((link: any) => link.entity_type === entityType)
      );
    }

    const profilesById = await loadProfiles(
      tasks.flatMap((task: any) => [task.assigned_to, task.created_by])
    );

    return json({
      tasks: tasks.map((task: any) => normalizeTask(task, profilesById)),
      currentRole: role,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const taskInput = parsed.data;
    if (!(await assertPortfolioInOrg(taskInput.portfolio_id, orgId))) {
      return json({ error: 'Portfolio does not belong to this organization' }, { status: 400 });
    }
    if (!(await assertUserInOrg(taskInput.assigned_to, orgId))) {
      return json({ error: 'Assignee is not a member of this organization' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { entity_links: entityLinks = [], ...taskFields } = taskInput;
    for (const link of entityLinks) {
      if (!(await assertEntityLinkInOrg(adminClient, orgId, link))) {
        return json(
          { error: `Linked ${link.entity_type} does not belong to this organization` },
          { status: 400 }
        );
      }
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .insert({
        ...taskFields,
        org_id: orgId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });

    if (entityLinks.length > 0) {
      const { error: linkError } = await adminClient.from('task_entity_links').insert(
        entityLinks.map(link => ({
          task_id: task.id,
          org_id: orgId,
          entity_type: link.entity_type,
          entity_id: link.entity_id,
          relationship: link.relationship || 'primary',
        }))
      );
      if (linkError) {
        await adminClient.from('tasks').delete().eq('id', task.id).eq('org_id', orgId);
        return json({ error: linkError.message }, { status: 500 });
      }
    }

    const { error: eventError } = await adminClient.from('task_events').insert({
      task_id: task.id,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'created',
      after_values: task,
    });
    if (eventError) {
      await adminClient.from('tasks').delete().eq('id', task.id).eq('org_id', orgId);
      return json({ error: eventError.message }, { status: 500 });
    }

    return json({ task }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
