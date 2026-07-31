import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createPledgeRepository } from '@/lib/api/repositories/pledges';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PatchInstallmentSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string; installmentId: string }> }
) {
  try {
    const { orgId, pledgeId, installmentId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;

    let body: any;
    try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }

    const parsed = PatchInstallmentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk({ error: parsed.error.issues }, { status: 400 });
    }

    const d = parsed.data;
    const { data: result, error } = await access.context.db.rpc('update_pledge_installment_status', {
      p_org_id:              orgId,
      p_pledge_id:           pledgeId,
      p_installment_id:      installmentId,
      p_action:              d.action,
      p_paid_at:             d.paid_at ?? null,
      p_payment_ref:         d.payment_ref ?? null,
      p_contribution_id:     d.contribution_id ?? null,
      p_create_contribution: d.create_contribution ?? false,
      p_notes:               d.notes ?? null,
    });
    if (error) return jsonError(error.message, 500);

    const repository = createPledgeRepository({
      orgId,
      actorId: access.context.principal.userId,
    });
    await repository.syncInstallmentTasks(installmentId, d.action);
    // 'reopen' intentionally does not close tasks — the producer will regenerate if due

    const { data: pledge } = await access.context.db
      .from('v_pledge_pipeline')
      .select('*')
      .eq('id', pledgeId)
      .eq('org_id', orgId)
      .single();
    const { data: installments } = await access.context.db
      .from('pledge_installments')
      .select('*')
      .eq('pledge_id', pledgeId)
      .eq('org_id', orgId)
      .order('due_date');

    return jsonOk({ result, pledge, installments });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
