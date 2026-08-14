import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createGrantRepository } from '@/lib/api/repositories/grants';

export const dynamic = 'force-dynamic';

const COMMUNICATION_DIRECTIONS = new Set(['inbound', 'outbound', 'internal']);

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
    const { data, error } = await repository.listCommunications(portfolioId);
    if (error) throw error;

    const communications = (data ?? []).map((communication: any) => ({
      ...communication,
      grant_name: communication.grants?.holdings?.name ?? 'Unknown grant',
      holding_id: communication.grants?.holding_id ?? null,
    }));
    return jsonOk({ communications });
  } catch (error: unknown) {
    return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const portfolioId = typeof body.portfolio_id === 'string' ? body.portfolio_id : '';
    const grantId = typeof body.grant_id === 'string' ? body.grant_id : '';
    const direction = typeof body.direction === 'string' ? body.direction : 'outbound';
    const commType = typeof body.comm_type === 'string' ? body.comm_type.trim() : 'email';
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';

    if (!portfolioId || !grantId) return jsonError('portfolio_id and grant_id are required', 400);
    if (!COMMUNICATION_DIRECTIONS.has(direction)) return jsonError('Invalid direction', 400);
    if (!commType || !summary) return jsonError('comm_type and summary are required', 400);

    const repository = createGrantRepository({ orgId, actorId: access.context.user.id });
    const result = await repository.createCommunication({
      portfolioId,
      grantId,
      direction: direction as 'inbound' | 'outbound' | 'internal',
      commType,
      subject: typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : null,
      summary,
      contactName: typeof body.contact_name === 'string' && body.contact_name.trim() ? body.contact_name.trim() : null,
      contactEmail: typeof body.contact_email === 'string' && body.contact_email.trim() ? body.contact_email.trim() : null,
      followUpRequired: body.follow_up_required === true,
      followUpDate: typeof body.follow_up_date === 'string' && body.follow_up_date ? body.follow_up_date : null,
      followUpNotes: typeof body.follow_up_notes === 'string' && body.follow_up_notes.trim() ? body.follow_up_notes.trim() : null,
    });
    if (result.notFound) return jsonError('Grant not found', 404);
    if (result.error) throw result.error;

    return jsonOk({ communication: result.data }, { status: 201 });
  } catch (error: unknown) {
    return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
  }
}
