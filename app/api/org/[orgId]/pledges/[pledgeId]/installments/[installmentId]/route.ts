import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { PatchInstallmentSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string; installmentId: string }> }
) {
  try {
    const { orgId, pledgeId, installmentId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!['owner','admin','member'].includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = PatchInstallmentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const d = parsed.data;
    const { data: result, error } = await supabase.rpc('update_pledge_installment_status', {
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: pledge }       = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ result, pledge, installments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
