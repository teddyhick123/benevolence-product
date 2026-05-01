import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();

    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, org_id')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'plan_ready') {
      return NextResponse.json(
        { error: `Proposal must be in plan_ready phase, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId });

    return NextResponse.json({ jobId, proposalId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
