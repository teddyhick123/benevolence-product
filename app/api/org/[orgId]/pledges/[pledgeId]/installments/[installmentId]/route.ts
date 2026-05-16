import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { PatchInstallmentSchema } from '@/lib/schemas/pledge';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string; installmentId: string }> }
) {
  try {
    const { orgId, pledgeId, installmentId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
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

    // Fire-and-forget: close generated tasks based on the action taken
    const action = d.action;
    (async () => {
      try {
        const adminDb = createAdminClient();
        const prefix = `pledge_installment:${installmentId}:`;
        if (action === 'mark_paid') {
          await completeGeneratedTasks(adminDb, orgId, prefix, 'Installment paid');
        } else if (action === 'waive') {
          await cancelGeneratedTasks(adminDb, orgId, prefix, 'Installment waived');
        } else if (action === 'write_off') {
          await cancelGeneratedTasks(adminDb, orgId, prefix, 'Installment written off');
        }
        // 'reopen' intentionally does not close tasks — the producer will regenerate if due
      } catch (err) {
        console.warn('[task-hook] Failed to update pledge installment tasks:', err);
      }
    })();

    const { data: pledge }       = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ result, pledge, installments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
