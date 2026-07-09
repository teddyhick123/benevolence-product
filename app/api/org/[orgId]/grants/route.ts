import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ADMIN_ROLES = new Set(['owner', 'admin']);
const LIFECYCLE_STAGE_SET = new Set<string>(LIFECYCLE_STAGES);

interface RouteParams {
  params: Promise<{ orgId: string }>;
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

// GET /api/org/[orgId]/grants
// Query params: stage, owner_id, risk_level, due_before, q, portfolio_id, page, page_size
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    const owner_id = url.searchParams.get('owner_id');
    const risk_level = url.searchParams.get('risk_level');
    const due_before = url.searchParams.get('due_before');
    const q = url.searchParams.get('q')?.trim();
    const portfolio_id = url.searchParams.get('portfolio_id');
    const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
    const requestedPageSize = Number.parseInt(url.searchParams.get('page_size') ?? '50', 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const page_size = Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(100, requestedPageSize)
      : 50;

    const db = createAdminClient();

    let query = db
      .from('grants')
      .select(
        `id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount,
         approved_amount, currency, purpose, grant_type, grant_period_start,
         grant_period_end, internal_owner_id, risk_level, reporting_frequency,
         renewal_eligible, created_at, updated_at,
         holdings!inner(name, ein, city, country, investee_id),
         portfolios(name)`,
        { count: 'exact' }
      )
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * page_size, page * page_size - 1);

    if (stage) query = query.eq('lifecycle_stage', stage);
    if (owner_id) query = query.eq('internal_owner_id', owner_id);
    if (risk_level) query = query.eq('risk_level', risk_level);
    if (portfolio_id) query = query.eq('portfolio_id', portfolio_id);
    if (due_before) query = query.lte('grant_period_end', due_before);
    if (q) query = query.ilike('holdings.name', `%${q.slice(0, 120)}%`);

    const { data, error, count } = await (query as any);
    if (error) throw error;

    return json({
      data,
      pagination: { page, page_size, total: count ?? 0 },
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

// POST /api/org/[orgId]/grants
// Atomically creates an optional investee row + holdings row + grants row
// + status history row (+ optional workflow instance) through a DB RPC.
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

    const body = await req.json();
    const {
      portfolio_id,
      investee_id,
      new_grantee,
      purpose,
      requested_amount,
      currency = 'USD',
      grant_type,
      grant_period_start,
      grant_period_end,
      lifecycle_stage = 'draft',
      internal_owner_id,
      risk_level,
      reporting_frequency,
      renewal_eligible,
      workflow_template_id,
    } = body;

    if (!portfolio_id) {
      return json({ error: 'portfolio_id is required' }, { status: 400 });
    }
    if (!purpose) {
      return json({ error: 'purpose is required' }, { status: 400 });
    }
    const numericRequestedAmount = Number(requested_amount);
    if (!Number.isFinite(numericRequestedAmount) || numericRequestedAmount < 0) {
      return json({ error: 'requested_amount must be a non-negative number' }, { status: 400 });
    }
    if (!LIFECYCLE_STAGE_SET.has(lifecycle_stage)) {
      return json({ error: 'Invalid lifecycle_stage' }, { status: 400 });
    }
    if (!investee_id && !new_grantee) {
      return json(
        { error: 'Provide either investee_id or new_grantee' },
        { status: 422 }
      );
    }
    if (investee_id && new_grantee) {
      return json(
        { error: 'Provide investee_id OR new_grantee, not both' },
        { status: 422 }
      );
    }

    const db = createAdminClient();

    // Verify portfolio belongs to org
    const { data: portfolio } = await db
      .from('portfolios')
      .select('id, org_id')
      .eq('id', portfolio_id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!portfolio) {
      return json({ error: 'Portfolio not found in this org' }, { status: 404 });
    }

    if (internal_owner_id) {
      const { data: owner } = await db
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', internal_owner_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!owner) return json({ error: 'internal_owner_id is not a member of this organization' }, { status: 400 });
    }

    const { data: created, error: createError } = await db.rpc('create_grant_with_foundation_records', {
      p_org_id: orgId,
      p_portfolio_id: portfolio_id,
      p_actor_id: user.id,
      p_purpose: purpose,
      p_requested_amount: numericRequestedAmount,
      p_investee_id: investee_id ?? null,
      p_new_grantee: new_grantee ?? null,
      p_currency: currency,
      p_grant_type: grant_type ?? null,
      p_grant_period_start: grant_period_start ?? null,
      p_grant_period_end: grant_period_end ?? null,
      p_lifecycle_stage: lifecycle_stage,
      p_internal_owner_id: internal_owner_id ?? null,
      p_risk_level: risk_level ?? null,
      p_reporting_frequency: reporting_frequency ?? null,
      p_renewal_eligible: renewal_eligible ?? false,
      p_workflow_template_id: workflow_template_id ?? null,
    });

    if (createError) {
      throw new Error(`Failed to create grant atomically: ${createError.message}`);
    }

    return json(
      {
        grant: created?.grant ?? null,
        holding: created?.holding ?? null,
        workflow_instance: created?.workflow_instance ?? null,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
