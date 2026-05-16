import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { CancelPledgeSchema } from '@/lib/schemas/pledge';
import { cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!['owner','admin'].includes(role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = CancelPledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const { error: pe } = await supabase.from('pledges')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: user?.id, cancellation_reason: parsed.data.cancellation_reason ?? null, updated_at: now })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null);
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

    if (parsed.data.waive_pending) {
      await supabase.from('pledge_installments')
        .update({ status: 'waived', waived_at: now, acted_by: user?.id, updated_at: now })
        .eq('pledge_id', pledgeId).eq('status', 'pending');
    }

    await supabase.from('pledge_events').insert({
      org_id: orgId, pledge_id: pledgeId, event_type: 'cancelled', actor_id: user?.id,
      after_values: { cancellation_reason: parsed.data.cancellation_reason, waive_pending: parsed.data.waive_pending },
    });

    // Fire-and-forget: cancel all generated tasks for each installment of this pledge
    (async () => {
      try {
        const adminDb = createAdminClient();
        const { data: instList } = await adminDb
          .from('pledge_installments')
          .select('id')
          .eq('pledge_id', pledgeId);
        for (const inst of instList ?? []) {
          await cancelGeneratedTasks(
            adminDb,
            orgId,
            `pledge_installment:${inst.id}:`,
            'Pledge cancelled'
          );
        }
      } catch (err) {
        console.warn('[task-hook] Failed to cancel pledge installment tasks:', err);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
