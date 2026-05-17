import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { startWorkflowSchema } from '@/lib/schemas/workflow';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

type TemplateStep = {
  id?: string;
  name?: string;
  description?: string;
  required?: boolean;
  estimated_days?: number;
  order?: number;
};

type NormalizedStep = {
  step_id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  sequence_order: number;
  estimated_days: number;
};

type WorkflowTaskRow = {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  source: string;
  source_key: string;
  due_at: string;
  assigned_to: string | null;
  created_by: string;
  metadata: Record<string, unknown>;
};

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

function normalizeStep(step: TemplateStep, index: number): NormalizedStep {
  const sequence = Number.isFinite(step.order) ? Number(step.order) : index + 1;
  return {
    step_id: step.id || `step_${sequence}`,
    name: step.name || `Step ${sequence}`,
    description: step.description || null,
    is_required: step.required !== false,
    sequence_order: sequence,
    estimated_days: Number.isFinite(step.estimated_days) ? Math.max(Number(step.estimated_days), 0) : 0,
  };
}

function stepDueAt(startedAt: Date, workflowDueAt: string | null, cumulativeDays: number) {
  if (workflowDueAt && cumulativeDays === 0) return workflowDueAt;
  const due = new Date(startedAt);
  due.setDate(due.getDate() + cumulativeDays);
  return due.toISOString();
}

async function loadGrantContext(input: {
  orgId: string;
  holdingId?: string | null;
  grantId?: string | null;
  portfolioId?: string | null;
}) {
  const adminClient = createAdminClient();
  let holding: any = null;
  let grantId = input.grantId || null;

  if (grantId) {
    const { data: grant, error } = await adminClient
      .from('grants')
      .select('id, holding_id')
      .eq('id', grantId)
      .maybeSingle();
    if (error) throw error;
    if (!grant) return { error: 'Grant not found' };
    const { data: grantHolding } = await adminClient
      .from('holdings')
      .select('id, name, portfolio_id, org_id')
      .eq('id', grant.holding_id)
      .eq('org_id', input.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!grantHolding) return { error: 'Grant does not belong to this organization' };
    holding = grantHolding;
  }

  if (!grantId && input.holdingId) {
    const { data: foundHolding, error } = await adminClient
      .from('holdings')
      .select('id, name, portfolio_id, org_id')
      .eq('id', input.holdingId)
      .eq('org_id', input.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!foundHolding) return { error: 'Holding does not belong to this organization' };
    holding = foundHolding;

    const { data: existingGrant } = await adminClient
      .from('grants')
      .select('id')
      .eq('holding_id', input.holdingId)
      .maybeSingle();

    if (existingGrant) {
      grantId = existingGrant.id;
    } else {
      const { data: newGrant, error: grantError } = await adminClient
        .from('grants')
        .insert({
          holding_id: input.holdingId,
          org_id: holding.org_id,
          portfolio_id: holding.portfolio_id,
        })
        .select('id')
        .single();
      if (grantError) throw grantError;
      grantId = newGrant.id;
    }
  }

  const portfolioId = holding?.portfolio_id || input.portfolioId || null;
  if (!(await assertPortfolioInOrg(portfolioId, input.orgId))) {
    return { error: 'Portfolio does not belong to this organization' };
  }

  return { grantId, holding, portfolioId };
}

async function loadWorkflow(adminClient: ReturnType<typeof createAdminClient>, orgId: string, workflowId: string) {
  const { data, error } = await adminClient
    .from('workflow_instances')
    .select(`
      *,
      workflow_templates(name, workflow_type),
      workflow_tasks(*),
      grants(holding_id)
    `)
    .eq('id', workflowId)
    .eq('org_id', orgId)
    .single();

  if (error) throw error;
  return data;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user: _user } } = await supabase.auth.getUser();
    if (!_user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get('portfolio_id');
    const status = searchParams.get('status');
    const grantId = searchParams.get('grant_id');

    const adminClient = createAdminClient();
    let query = adminClient
      .from('workflow_instances')
      .select(`
        *,
        workflow_templates(name, workflow_type),
        grants(holding_id, holdings(name)),
        workflow_tasks(*)
      `)
      .eq('org_id', orgId)
      .order('started_at', { ascending: false });

    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (grantId) query = query.eq('grant_id', grantId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ workflows: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const createdIds: { workflowId?: string; taskIds: string[] } = { taskIds: [] };

  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = startWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const input = parsed.data;
    if (!(await assertUserInOrg(input.assigned_to, orgId))) {
      return NextResponse.json({ error: 'Assignee is not a member of this organization' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: template, error: templateError } = await adminClient
      .from('workflow_templates')
      .select('*')
      .eq('id', input.template_id)
      .eq('is_active', true)
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) return NextResponse.json({ error: 'Workflow template not found' }, { status: 404 });

    const grantContext = await loadGrantContext({
      orgId,
      holdingId: input.holding_id,
      grantId: input.grant_id,
      portfolioId: input.portfolio_id,
    });
    if ('error' in grantContext) {
      return NextResponse.json({ error: grantContext.error }, { status: 400 });
    }

    const startedAt = new Date();
    const dueAt = input.due_at || (input.due_date ? new Date(`${input.due_date}T12:00:00Z`).toISOString() : null);
    const workflowName = input.name || `${template.name}${grantContext.holding?.name ? ` - ${grantContext.holding.name}` : ''}`;

    const { data: workflow, error: workflowError } = await adminClient
      .from('workflow_instances')
      .insert({
        org_id: orgId,
        portfolio_id: grantContext.portfolioId,
        template_id: template.id,
        grant_id: grantContext.grantId,
        name: workflowName,
        workflow_type: template.workflow_type,
        status: 'active',
        due_date: input.due_date || null,
        due_at: dueAt,
        started_at: startedAt.toISOString(),
        created_by: user.id,
        notes: input.notes || null,
        metadata: input.metadata || {},
      })
      .select()
      .single();

    if (workflowError) throw workflowError;
    createdIds.workflowId = workflow.id;

    const rawSteps: TemplateStep[] = Array.isArray(template.steps) ? template.steps : [];
    const steps: NormalizedStep[] = rawSteps
      .map(normalizeStep)
      .sort((a: NormalizedStep, b: NormalizedStep) => a.sequence_order - b.sequence_order);

    let cumulativeDays = 0;
    const taskRows: WorkflowTaskRow[] = steps.map((step: NormalizedStep) => {
      cumulativeDays += step.estimated_days;
      const id = crypto.randomUUID();
      createdIds.taskIds.push(id);
      return {
        id,
        org_id: orgId,
        portfolio_id: grantContext.portfolioId,
        title: step.name,
        description: step.description,
        status: 'open',
        priority: step.is_required ? 'normal' : 'low',
        task_type: 'checklist_step',
        source: 'template',
        source_key: `${workflow.id}:${step.step_id}`,
        due_at: stepDueAt(startedAt, dueAt, cumulativeDays),
        assigned_to: input.assigned_to || null,
        created_by: user.id,
        metadata: {
          workflow_id: workflow.id,
          workflow_step_id: step.step_id,
          workflow_type: template.workflow_type,
        },
      };
    });

    if (taskRows.length > 0) {
      const { error: taskError } = await adminClient.from('tasks').insert(taskRows);
      if (taskError) throw taskError;

      const { error: workflowTaskError } = await adminClient.from('workflow_tasks').insert(
        steps.map((step: NormalizedStep, index: number) => ({
          workflow_id: workflow.id,
          task_id: taskRows[index].id,
          step_id: step.step_id,
          name: step.name,
          description: step.description,
          status: 'pending',
          is_required: step.is_required,
          sequence_order: step.sequence_order,
          due_date: taskRows[index].due_at ? taskRows[index].due_at.slice(0, 10) : null,
        }))
      );
      if (workflowTaskError) throw workflowTaskError;

      const entityLinks = taskRows.flatMap((task: WorkflowTaskRow) => [
        {
          task_id: task.id,
          org_id: orgId,
          entity_type: 'workflow_instance',
          entity_id: workflow.id,
          relationship: 'source',
        },
        ...(grantContext.grantId ? [{
          task_id: task.id,
          org_id: orgId,
          entity_type: 'grant',
          entity_id: grantContext.grantId,
          relationship: 'primary',
        }] : []),
        ...(grantContext.holding?.id ? [{
          task_id: task.id,
          org_id: orgId,
          entity_type: 'holding',
          entity_id: grantContext.holding.id,
          relationship: 'context',
        }] : []),
      ]);
      const { error: linkError } = await adminClient.from('task_entity_links').insert(entityLinks);
      if (linkError) throw linkError;
    }

    const loaded = await loadWorkflow(adminClient, orgId, workflow.id);
    return NextResponse.json({ workflow: loaded }, { status: 201 });
  } catch (err: any) {
    const adminClient = createAdminClient();
    if (createdIds.taskIds.length > 0) {
      await adminClient.from('tasks').delete().in('id', createdIds.taskIds);
    }
    if (createdIds.workflowId) {
      await adminClient.from('workflow_instances').delete().eq('id', createdIds.workflowId);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
