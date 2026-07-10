import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';
import { canReviewImplementation } from '@/lib/org-capabilities';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

// Phases from which a reviewer may start (or retry) a run, and phases that
// mean a run is already active. Any other phase is a state-machine violation.
const CLAIMABLE_PHASES = ['plan_ready', 'needs_repair', 'failed'];
const IN_FLIGHT_PHASES = ['queued', 'building', 'build_ready', 'reviewing'];

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
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

    // Atomic compare-and-set claim: only one caller can move the proposal
    // into `queued`; a concurrent duplicate start updates zero rows.
    const { data: claimed, error: claimError } = await adminSupabase
      .from('builder_proposals')
      .update({ phase: 'queued' })
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .in('phase', CLAIMABLE_PHASES)
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;

    if (!claimed) {
      const { data: proposal, error: fetchError } = await adminSupabase
        .from('builder_proposals')
        .select('id, phase')
        .eq('id', proposalId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });
      if (IN_FLIGHT_PHASES.includes(proposal.phase ?? '')) {
        return json({ proposalId, alreadyRunning: true });
      }
      return json(
        { error: `Proposal must be in one of [${CLAIMABLE_PHASES.join(', ')}] to start a run, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    try {
      const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId });
      return json({ jobId, proposalId });
    } catch (queueError) {
      // Don't strand the proposal in `queued` with no job behind it.
      await adminSupabase
        .from('builder_proposals')
        .update({ phase: 'failed' })
        .eq('id', proposalId)
        .eq('org_id', orgId);
      throw queueError;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
