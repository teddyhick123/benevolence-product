import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const db = createAdminClient();
    const { data, error } = await db
      .from('grant_decisions')
      .select('*')
      .eq('grant_id', grantId)
      .eq('org_id', orgId)
      .order('decision_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
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
    const {
      decision_type,
      decision,
      decision_date,
      decided_by,
      amount,
      conditions,
      rationale,
      board_meeting_date,
      metadata,
    } = body;

    if (!decision_type || !decision || !decision_date) {
      return NextResponse.json(
        { error: 'decision_type, decision, and decision_date are required' },
        { status: 400 }
      );
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('grant_decisions')
      .insert({
        grant_id: grantId,
        org_id: orgId,
        decision_type,
        decision,
        decision_date,
        decided_by: decided_by ?? user.id,
        amount: amount ?? null,
        conditions: conditions ?? null,
        rationale: rationale ?? null,
        board_meeting_date: board_meeting_date ?? null,
        metadata: metadata ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
