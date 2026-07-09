import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CreatePledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ALLOWED_ROLES = ['owner', 'admin', 'member'];

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

async function authorize(supabase: any, orgId: string) {
  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role || !ALLOWED_ROLES.includes(role)) return null;
  return role as string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const statusFilter    = sp.get('status') || 'active';
    const pipelineFilter  = sp.get('pipeline_status');
    const donorId         = sp.get('donor_id');
    const campaign        = sp.get('campaign');
    const requestedLimit  = Number.parseInt(sp.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(sp.get('offset') || '0', 10);
    const limit           = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 50;
    const offset          = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    // --- Pledge rows from view ---
    let q = supabase.from('v_pledge_pipeline').select('*', { count: 'exact' }).eq('org_id', orgId);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (pipelineFilter) q = q.eq('pipeline_status', pipelineFilter);
    if (donorId)   q = q.eq('donor_id', donorId);
    if (campaign)  q = q.eq('campaign', campaign);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data: pledges, count, error } = await q;
    if (error) return json({ error: error.message }, { status: 500 });

    const { data: metrics, error: metricsError } = await supabase.rpc('get_pledge_dashboard_metrics', {
      p_org_id: orgId,
    });
    if (metricsError) return json({ error: metricsError.message }, { status: 500 });

    // --- Attention lists (from the view rows) ---
    const { data: attRows } = await supabase
      .from('v_pledge_pipeline')
      .select('*')
      .eq('org_id', orgId)
      .in('pipeline_status', ['overdue','due_soon'])
      .order('next_due_date', { ascending: true })
      .limit(20);

    const attention = {
      overdue:  (attRows ?? []).filter((r: any) => r.pipeline_status === 'overdue').slice(0, 5),
      dueSoon:  (attRows ?? []).filter((r: any) => r.pipeline_status === 'due_soon').slice(0, 5),
    };

    return json({
      kpis: metrics?.kpis ?? { committed: 0, received: 0, outstanding: 0, overdue: 0, dueSoon: 0, fulfillmentRate: 0 },
      aging: metrics?.aging ?? { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
      forecast: metrics?.forecast ?? [],
      attention,
      pledges: pledges ?? [],
      total: count ?? 0,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = CreatePledgeSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

    const d = parsed.data;
    const { data: result, error } = await supabase.rpc('create_pledge_with_installments', {
      p_org_id:               orgId,
      p_donor_id:             d.donor_id,
      p_total_amount:         d.total_amount,
      p_currency:             d.currency,
      p_start_date:           d.start_date,
      p_end_date:             d.end_date ?? null,
      p_frequency:            d.frequency,
      p_commitment_type:      d.commitment_type,
      p_campaign:             d.campaign ?? null,
      p_fund_designation:     d.fund_designation ?? null,
      p_restriction_purpose:  d.restriction_purpose ?? null,
      p_relationship_manager: d.relationship_manager ?? null,
      p_signed_at:            d.signed_at ?? null,
      p_notes:                d.notes ?? null,
      p_installments:         d.installments,
    });
    if (error) return json({ error: error.message }, { status: 500 });

    const pledgeId = (result as any).pledge_id;
    const { data: pledge } = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return json({ pledge, installments }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
