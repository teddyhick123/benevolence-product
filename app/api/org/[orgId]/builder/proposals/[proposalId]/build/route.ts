import { NextRequest, NextResponse } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { createOrgBuilderRepository } from '@/lib/api/repositories/builder';
import { canReviewImplementation } from '@/lib/organizations/capabilities';

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
    const access = await requireUserAccess();
    if (isAccessDenied(access)) return access.response;

    const canReview = await canReviewImplementation(access.context.db, orgId);
    if (!canReview) {
      return json({ error: 'Implementation reviewer access required' }, { status: 403 });
    }

    const result = await createOrgBuilderRepository({
      orgId,
      actorId: access.context.user.id,
    }).startBuild(proposalId);

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return json({ error: 'Proposal not found' }, { status: 404 });
      }
      if (result.reason === 'no_revision') {
        return json({ error: 'Proposal has no revision to build' }, { status: 500 });
      }
      return json({
        error: `Proposal must be claimable to start a run, currently: ${result.currentState}`,
        currentState: result.currentState,
      }, { status: 409 });
    }

    if ('alreadyRunning' in result) {
      return json({ proposalId: result.proposalId, alreadyRunning: true });
    }
    return json({
      jobId: result.jobId,
      proposalId: result.proposalId,
      revisionId: result.revisionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
