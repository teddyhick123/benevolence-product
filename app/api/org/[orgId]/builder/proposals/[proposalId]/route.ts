import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { data: proposal, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, plan_content, generated_code, review_report, created_at')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (error || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json({ proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
