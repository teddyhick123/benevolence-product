import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { PatchPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'admin', 'member'];
const ADMIN_ROLES   = ['owner', 'admin'];

async function getRole(supabase: any, orgId: string): Promise<string | null> {
  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  return role || null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const [
      { data: pledge, error: pledgeError },
      { data: installments, error: installmentsError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).eq('org_id', orgId).single(),
      supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).eq('org_id', orgId).order('due_date'),
      supabase.from('pledge_events').select('*').eq('pledge_id', pledgeId).order('created_at', { ascending: false }).limit(50),
    ]);
    if (pledgeError) return NextResponse.json({ error: pledgeError.message }, { status: pledgeError.code === 'PGRST116' ? 404 : 500 });
    if (installmentsError) return NextResponse.json({ error: installmentsError.message }, { status: 500 });
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

    const contributionIds = [...new Set(
      (installments ?? [])
        .map((installment: any) => installment.contribution_id)
        .filter(Boolean)
    )];

    let contributionsById: Record<string, any> = {};
    if (contributionIds.length > 0) {
      const { data: contributions, error: contributionsError } = await supabase
        .from('contributions_received')
        .select('id, contribution_date, amount, gift_type, acknowledgment_sent, pledge_id, pledge_installment_id')
        .eq('org_id', orgId)
        .in('id', contributionIds);

      if (contributionsError) return NextResponse.json({ error: contributionsError.message }, { status: 500 });
      contributionsById = Object.fromEntries((contributions ?? []).map((contribution: any) => [contribution.id, contribution]));
    }

    const installmentsWithContributions = (installments ?? []).map((installment: any) => ({
      ...installment,
      contribution: installment.contribution_id ? contributionsById[installment.contribution_id] ?? null : null,
    }));

    return NextResponse.json({ pledge, installments: installmentsWithContributions, events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = PatchPledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { data: pledge, error } = await supabase
      .from('pledges')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null)
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pledge });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ADMIN_ROLES.includes(role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('pledges')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, updated_at: new Date().toISOString() })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
