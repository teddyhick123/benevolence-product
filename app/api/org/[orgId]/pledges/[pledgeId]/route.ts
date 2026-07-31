import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PatchPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;
    const db = access.context.db;

    const [
      { data: pledge, error: pledgeError },
      { data: installments, error: installmentsError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      db.from('v_pledge_pipeline').select('*').eq('id', pledgeId).eq('org_id', orgId).single(),
      db.from('pledge_installments').select('*').eq('pledge_id', pledgeId).eq('org_id', orgId).order('due_date'),
      db.from('pledge_events').select('*').eq('pledge_id', pledgeId).eq('org_id', orgId).order('created_at', { ascending: false }).limit(50),
    ]);
    if (pledgeError) return jsonError(pledgeError.message, pledgeError.code === 'PGRST116' ? 404 : 500);
    if (installmentsError) return jsonError(installmentsError.message, 500);
    if (eventsError) return jsonError(eventsError.message, 500);

    const contributionIds = [...new Set(
      (installments ?? [])
        .map((installment: any) => installment.contribution_id)
        .filter(Boolean)
    )];

    let contributionsById: Record<string, any> = {};
    if (contributionIds.length > 0) {
      const { data: contributions, error: contributionsError } = await db
        .from('contributions_received')
        .select('id, contribution_date, amount, gift_type, acknowledgment_sent, pledge_id, pledge_installment_id')
        .eq('org_id', orgId)
        .in('id', contributionIds);

      if (contributionsError) return jsonError(contributionsError.message, 500);
      contributionsById = Object.fromEntries((contributions ?? []).map((contribution: any) => [contribution.id, contribution]));
    }

    const installmentsWithContributions = (installments ?? []).map((installment: any) => ({
      ...installment,
      contribution: installment.contribution_id ? contributionsById[installment.contribution_id] ?? null : null,
    }));

    return jsonOk({ pledge, installments: installmentsWithContributions, events });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;

    let body: any;
    try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }

    const parsed = PatchPledgeSchema.safeParse(body);
    if (!parsed.success) return jsonOk({ error: parsed.error.issues }, { status: 400 });

    const { data: pledge, error } = await access.context.db
      .from('pledges')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null)
      .select().single();
    if (error) return jsonError(error.message, 500);

    return jsonOk({ pledge });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;
    const { error } = await access.context.db
      .from('pledges')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: access.context.principal.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null);
    if (error) return jsonError(error.message, 500);

    return jsonOk({ success: true });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
