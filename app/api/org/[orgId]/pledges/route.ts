import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CreatePledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;
    const db = access.context.db;

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
    let q = db.from('v_pledge_pipeline').select('*', { count: 'exact' }).eq('org_id', orgId);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (pipelineFilter) q = q.eq('pipeline_status', pipelineFilter);
    if (donorId)   q = q.eq('donor_id', donorId);
    if (campaign)  q = q.eq('campaign', campaign);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data: pledges, count, error } = await q;
    if (error) return jsonError(error.message, 500);

    const { data: metrics, error: metricsError } = await db.rpc('get_pledge_dashboard_metrics', {
      p_org_id: orgId,
    });
    if (metricsError) return jsonError(metricsError.message, 500);

    // --- Attention lists (from the view rows) ---
    const { data: attRows } = await db
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

    return jsonOk({
      kpis: metrics?.kpis ?? { committed: 0, received: 0, outstanding: 0, overdue: 0, dueSoon: 0, fulfillmentRate: 0 },
      aging: metrics?.aging ?? { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
      forecast: metrics?.forecast ?? [],
      attention,
      pledges: pledges ?? [],
      total: count ?? 0,
    });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;
    const db = access.context.db;

    let body: any;
    try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }

    const parsed = CreatePledgeSchema.safeParse(body);
    if (!parsed.success) return jsonOk({ error: parsed.error.issues }, { status: 400 });

    const d = parsed.data;
    const { data: result, error } = await db.rpc('create_pledge_with_installments', {
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
    if (error) return jsonError(error.message, 500);

    const pledgeId = (result as any).pledge_id;
    const { data: pledge } = await db
      .from('v_pledge_pipeline')
      .select('*')
      .eq('id', pledgeId)
      .eq('org_id', orgId)
      .single();
    const { data: installments } = await db
      .from('pledge_installments')
      .select('*')
      .eq('pledge_id', pledgeId)
      .eq('org_id', orgId)
      .order('due_date');

    return jsonOk({ pledge, installments }, { status: 201 });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
