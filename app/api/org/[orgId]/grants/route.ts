import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/grants
// Query params: stage, owner_id, risk_level, due_before, q, portfolio_id, page, page_size
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    const owner_id = url.searchParams.get('owner_id');
    const risk_level = url.searchParams.get('risk_level');
    const due_before = url.searchParams.get('due_before');
    const q = url.searchParams.get('q');
    const portfolio_id = url.searchParams.get('portfolio_id');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const page_size = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') ?? '50', 10)));

    const db = createAdminClient();

    let query = db
      .from('grants')
      .select(
        `id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount,
         approved_amount, currency, purpose, grant_type, grant_period_start,
         grant_period_end, internal_owner_id, risk_level, reporting_frequency,
         renewal_eligible, created_at, updated_at,
         holdings!inner(name, ein, city, country, investee_id)`,
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
    if (q) query = query.ilike('holdings.name', `%${q}%`);

    const { data, error, count } = await (query as any);
    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: { page, page_size, total: count ?? 0 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

// POST /api/org/[orgId]/grants
// Atomically creates a holdings row + grants row (+ optional workflow instance)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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
      return NextResponse.json({ error: 'portfolio_id is required' }, { status: 400 });
    }
    if (!purpose) {
      return NextResponse.json({ error: 'purpose is required' }, { status: 400 });
    }
    if (requested_amount == null) {
      return NextResponse.json({ error: 'requested_amount is required' }, { status: 400 });
    }
    if (!investee_id && !new_grantee) {
      return NextResponse.json(
        { error: 'Provide either investee_id or new_grantee' },
        { status: 422 }
      );
    }
    if (investee_id && new_grantee) {
      return NextResponse.json(
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
      return NextResponse.json({ error: 'Portfolio not found in this org' }, { status: 404 });
    }

    // Resolve or create investee
    let resolvedInvesteeId: string | null = investee_id ?? null;
    let grantName: string;

    if (new_grantee) {
      const { data: investee, error: investeeErr } = await db
        .from('investees')
        .insert({
          display_name: new_grantee.display_name,
          sector: new_grantee.sector ?? null,
          country: new_grantee.country ?? null,
          region: new_grantee.city ?? null,
        })
        .select()
        .single();
      if (investeeErr) throw new Error(`Failed to create investee: ${investeeErr.message}`);
      resolvedInvesteeId = investee.id;
      grantName = new_grantee.display_name;
    } else {
      // Look up existing investee name
      const { data: investee } = await db
        .from('investees')
        .select('display_name')
        .eq('id', investee_id)
        .maybeSingle();
      grantName = investee?.display_name ?? 'Grant';
    }

    // Create holding
    const { data: holding, error: holdingErr } = await db
      .from('holdings')
      .insert({
        portfolio_id,
        org_id: orgId,
        asset_type: 'foundation_grant',
        name: grantName,
        investee_id: resolvedInvesteeId,
        amount_invested: requested_amount,
        currency,
        investment_date: grant_period_start ?? null,
      })
      .select()
      .single();
    if (holdingErr) throw new Error(`Failed to create holding: ${holdingErr.message}`);

    // Create grant
    const { data: grant, error: grantErr } = await db
      .from('grants')
      .insert({
        holding_id: holding.id,
        org_id: orgId,
        portfolio_id,
        purpose,
        requested_amount,
        currency,
        grant_type: grant_type ?? null,
        grant_period_start: grant_period_start ?? null,
        grant_period_end: grant_period_end ?? null,
        lifecycle_stage,
        internal_owner_id: internal_owner_id ?? null,
        risk_level: risk_level ?? null,
        reporting_frequency: reporting_frequency ?? null,
        renewal_eligible: renewal_eligible ?? null,
      })
      .select()
      .single();
    if (grantErr) {
      // Attempt cleanup of the holding we already created
      await db.from('holdings').delete().eq('id', holding.id);
      throw new Error(`Failed to create grant: ${grantErr.message}`);
    }

    // Append initial status history
    await db.from('grant_status_history').insert({
      grant_id: grant.id,
      org_id: orgId,
      from_stage: null,
      to_stage: lifecycle_stage,
      reason: 'Grant created',
      actor_id: user.id,
    });

    // Optional workflow instance
    if (workflow_template_id) {
      const { data: template } = await db
        .from('workflow_templates')
        .select('id, steps')
        .eq('id', workflow_template_id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (template) {
        await db.from('workflow_instances').insert({
          template_id: template.id,
          org_id: orgId,
          portfolio_id,
          holding_id: holding.id,
          status: 'active',
          current_step: 0,
          steps_data: template.steps ?? [],
        });
      }
    }

    return NextResponse.json({ grant, holding }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
