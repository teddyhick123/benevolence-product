import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';
import { canReviewImplementation } from '@/lib/org-capabilities';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const canReview = await canReviewImplementation(supabase as any, orgId);
    if (!canReview) {
      return json({ error: 'Implementation reviewer access required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, org_id')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !proposal) {
      return json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'plan_ready') {
      return json(
        { error: `Proposal must be in plan_ready phase, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId });

    return json({ jobId, proposalId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
