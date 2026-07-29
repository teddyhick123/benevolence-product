import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  BuilderProposalNotFoundError,
  createOrgBuilderReadRepository,
} from '@/lib/api/repositories/builder-reads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const result = await createOrgBuilderReadRepository({ orgId })
      .getProposalDetails(proposalId);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof BuilderProposalNotFoundError) {
      return jsonError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
