import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CreatePledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'admin', 'member'];

async function authorize(supabase: any, orgId: string) {
  const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
  if (!role || !ALLOWED_ROLES.includes(role)) return null;
  return role as string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const statusFilter    = sp.get('status') || 'active';
    const pipelineFilter  = sp.get('pipeline_status');
    const donorId         = sp.get('donor_id');
    const campaign        = sp.get('campaign');
    const limit           = Math.min(parseInt(sp.get('limit') || '50'), 200);
    const offset          = parseInt(sp.get('offset') || '0');

    // --- Pledge rows from view ---
    let q = supabase.from('v_pledge_pipeline').select('*', { count: 'exact' }).eq('org_id', orgId);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (donorId)   q = q.eq('donor_id', donorId);
    if (campaign)  q = q.eq('campaign', campaign);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data: pledges, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Apply pipeline_status filter in JS (it's a computed column in the view)
    const rows = pipelineFilter
      ? (pledges ?? []).filter((p: any) => p.pipeline_status === pipelineFilter)
      : (pledges ?? []);

    // --- KPIs across ALL non-deleted pledges for this org ---
    const { data: allInstallments } = await supabase
      .from('pledge_installments')
      .select('amount, status, due_date, pledge_id')
      .eq('org_id', orgId);

    const { data: allPledges } = await supabase
      .from('pledges')
      .select('id, total_amount, status')
      .eq('org_id', orgId)
      .is('deleted_at', null);

    const today = new Date().toISOString().slice(0, 10);
    const activePledgeIds = new Set(
      (allPledges ?? []).filter((p: any) => !['cancelled','defaulted','written_off'].includes(p.status)).map((p: any) => p.id)
    );
    const committed  = (allPledges ?? []).filter((p: any) => activePledgeIds.has(p.id)).reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const received   = (allInstallments ?? []).filter((i: any) => i.status === 'paid' && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const outstanding= (allInstallments ?? []).filter((i: any) => i.status === 'pending' && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const overdue    = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date < today && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const dueSoon    = (allInstallments ?? []).filter((i: any) => {
      const d30 = new Date(); d30.setDate(d30.getDate() + 30); const d30s = d30.toISOString().slice(0, 10);
      return i.status === 'pending' && i.due_date >= today && i.due_date <= d30s && activePledgeIds.has(i.pledge_id);
    }).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const fulfilledCount = (allPledges ?? []).filter((p: any) => p.status === 'fulfilled').length;
    const totalCount     = (allPledges ?? []).filter((p: any) => !['cancelled','defaulted','written_off'].includes(p.status)).length;
    const fulfillmentRate = totalCount > 0 ? Math.round((fulfilledCount / totalCount) * 100) : 0;

    // --- Aging buckets (overdue installments) ---
    const overdueInst = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date < today && activePledgeIds.has(i.pledge_id));
    const aging = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 };
    const todayMs = new Date(today).getTime();
    for (const i of overdueInst) {
      const days = Math.floor((todayMs - new Date(i.due_date).getTime()) / 86400000);
      const amt = Number(i.amount);
      if (days <= 0)       aging.current    += amt;
      else if (days <= 30) aging.days1To30   += amt;
      else if (days <= 60) aging.days31To60  += amt;
      else if (days <= 90) aging.days61To90  += amt;
      else                 aging.days90Plus  += amt;
    }

    // --- 12-month forecast ---
    const forecast: Array<{ month: string; expected: number; received: number }> = [];
    for (let m = -6; m < 6; m++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + m);
      const month = d.toISOString().slice(0, 7);
      const expected = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date.startsWith(month) && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
      const rec      = (allInstallments ?? []).filter((i: any) => i.status === 'paid'    && i.due_date.startsWith(month) && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
      forecast.push({ month, expected, received: rec });
    }

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

    return NextResponse.json({
      kpis: { committed, received, outstanding, overdue, dueSoon, fulfillmentRate },
      aging,
      forecast,
      attention,
      pledges: rows,
      total: count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = CreatePledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

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
      p_installments:         JSON.stringify(d.installments),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const pledgeId = (result as any).pledge_id;
    const { data: pledge } = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ pledge, installments }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
