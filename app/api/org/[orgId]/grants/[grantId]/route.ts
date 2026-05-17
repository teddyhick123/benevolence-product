import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

// Fields that can be PATCHed; lifecycle_stage is excluded — use /transition instead
const PATCHABLE_FIELDS = new Set([
  'purpose',
  'requested_amount',
  'approved_amount',
  'internal_owner_id',
  'risk_level',
  'reporting_frequency',
  'renewal_eligible',
  'grant_period_start',
  'grant_period_end',
  'grant_type',
  'currency',
]);

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

// GET /api/org/[orgId]/grants/[grantId]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const db = createAdminClient();

    // Main grant row with holding
    const { data: grant, error: grantErr } = await db
      .from('grants')
      .select(
        `*, holdings(id, name, ein, city, country, investee_id, asset_type,
           amount_invested, currency, investment_date, exit_date)`
      )
      .eq('id', grantId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (grantErr) throw grantErr;
    if (!grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 });

    // Parallel fetches for the detail workspace
    const [healthResult, tasksResult, paymentsResult, commsResult, historyResult] =
      await Promise.all([
        db
          .from('v_grant_health')
          .select('*')
          .eq('grant_id', grantId)
          .maybeSingle(),
        db
          .from('task_entity_links')
          .select('task_id, relationship, tasks(id, title, status, priority, due_at, task_type)')
          .eq('entity_type', 'grant')
          .eq('entity_id', grantId)
          .order('task_id'),
        db
          .from('grant_payments')
          .select('*')
          .eq('grant_id', grantId)
          .order('payment_number', { ascending: true })
          .limit(20),
        db
          .from('grant_communications')
          .select('*')
          .eq('grant_id', grantId)
          .order('communication_date', { ascending: false })
          .limit(10),
        db
          .from('grant_status_history')
          .select('*')
          .eq('grant_id', grantId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

    return NextResponse.json({
      grant,
      health: healthResult.data ?? null,
      tasks: tasksResult.data ?? [],
      payments: paymentsResult.data ?? [],
      communications: commsResult.data ?? [],
      history: historyResult.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/grants/[grantId]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();

    // Only allow patchable fields; reject attempts to change lifecycle_stage directly
    if ('lifecycle_stage' in body) {
      return NextResponse.json(
        { error: 'Use the /transition endpoint to change lifecycle_stage' },
        { status: 422 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (PATCHABLE_FIELDS.has(key)) {
        update[key] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No patchable fields provided' }, { status: 400 });
    }

    const db = createAdminClient();

    // Verify grant belongs to org
    const { data: existing } = await db
      .from('grants')
      .select('id')
      .eq('id', grantId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Grant not found' }, { status: 404 });

    const { data, error } = await db
      .from('grants')
      .update(update)
      .eq('id', grantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
