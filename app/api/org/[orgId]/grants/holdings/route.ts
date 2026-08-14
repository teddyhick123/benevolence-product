import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createGrantRepository } from '@/lib/api/repositories/grants';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const portfolioId = new URL(req.url).searchParams.get('portfolio_id');
    if (!portfolioId) return jsonError('portfolio_id is required', 400);

    const repository = createGrantRepository({ orgId, actorId: access.context.user.id });
    const { data, error } = await repository.listGrantHoldings(portfolioId);
    if (error) throw error;

    const holdings = (data ?? []).flatMap((grant: any) => {
      const holding = grant.holdings;
      return holding ? [{ id: holding.id, name: holding.name, grant_id: grant.id }] : [];
    }).sort((left, right) => left.name.localeCompare(right.name));

    return jsonOk({ holdings });
  } catch (error: unknown) {
    return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
  }
}
