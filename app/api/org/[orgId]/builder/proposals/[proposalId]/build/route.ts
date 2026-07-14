import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';
import { canReviewImplementation } from '@/lib/org-capabilities';
import { claimCodeRun, failInFlightRun, IN_FLIGHT_STATES, type CodeState } from '@/lib/builder/proposal-state';
import { isGitHubConfigured, getDefaultBranchSha } from '@/lib/builder/github-apply';

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

    // Read current code_state first so an already-running proposal short-
    // circuits to `alreadyRunning` without consuming the claim RPC's row
    // lock (builder_claim_code_run does FOR UPDATE on the proposal row).
    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('code_state')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });

    if (IN_FLIGHT_STATES.includes((proposal.code_state ?? '') as CodeState)) {
      return json({ proposalId, alreadyRunning: true });
    }

    // Atomic claim: row-locks the proposal, validates it's claimable, and
    // either creates a fresh revision (scaffold path) or reuses the current
    // one (generic path).
    const claim = await claimCodeRun(adminSupabase, { proposalId, orgId, actorId: user.id });
    if (!claim.ok) {
      if (claim.code === 'not_found') {
        return json({ error: 'Proposal not found' }, { status: 404 });
      }
      if (claim.code === 'no_revision') {
        return json({ error: 'Proposal has no revision to build' }, { status: 500 });
      }
      return json(
        {
          error: `Proposal must be claimable to start a run, currently: ${claim.currentState}`,
          currentState: claim.currentState,
        },
        { status: 409 }
      );
    }

    const { revisionId } = claim;

    // Best-effort: stamp the revision with the GitHub default branch's tip
    // SHA so later apply/rebase logic has a base to diff against. A GitHub
    // outage here must not fail the claim itself.
    if (isGitHubConfigured()) {
      try {
        const baseSha = await getDefaultBranchSha();
        const { error: shaError } = await adminSupabase
          .from('builder_proposal_revisions')
          .update({ base_commit_sha: baseSha })
          .eq('id', revisionId);
        if (shaError) throw shaError;
      } catch (shaCaptureError) {
        console.error(`[builder/build] Could not capture base SHA for revision ${revisionId}:`, shaCaptureError);
      }
    }

    try {
      const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId, revisionId });
      return json({ jobId, proposalId, revisionId });
    } catch (queueError) {
      // Don't strand the proposal in an in-flight state with no job behind it.
      await failInFlightRun(adminSupabase, proposalId);
      throw queueError;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
