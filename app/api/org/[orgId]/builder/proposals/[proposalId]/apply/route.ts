import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import {
  BuilderApplyError,
  createOrgBuilderApplyRepository,
} from '@/lib/api/repositories/builder-apply';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { isGitHubConfigured } from '@/lib/builder/github-apply';
import { canReviewImplementation } from '@/lib/organizations/capabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const access = await requireUserAccess();
    if (isAccessDenied(access)) return access.response;

    const canReview = await canReviewImplementation(access.context.db, orgId);
    if (!canReview) {
      return jsonError('Implementation reviewer access required', 403);
    }
    if (!isGitHubConfigured()) {
      return jsonError('GitHub integration not configured', 503);
    }

    const result = await createOrgBuilderApplyRepository({
      orgId,
      actorId: access.context.user.id,
    }).applyProposal(proposalId);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof BuilderApplyError) {
      return jsonError(error.message, error.status, error.details);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
