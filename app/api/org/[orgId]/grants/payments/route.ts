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
    const { data, error } = await repository.listPayments(portfolioId);
    if (error) throw error;

    const payments = (data ?? []).map((payment: any) => ({
      ...payment,
      grant_name: payment.grants?.holdings?.name ?? 'Unknown grant',
      holding_id: payment.grants?.holding_id ?? null,
    }));
    return jsonOk({ payments });
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
    const amount = Number(body.amount);
    if (!portfolioId || !grantId) return jsonError('portfolio_id and grant_id are required', 400);
    if (!Number.isFinite(amount) || amount < 0) return jsonError('amount must be a non-negative number', 400);

    const repository = createGrantRepository({ orgId, actorId: access.context.user.id });
    const result = await repository.createPayment({
      portfolioId,
      grantId,
      amount,
      scheduledDate: typeof body.scheduled_date === 'string' && body.scheduled_date ? body.scheduled_date : null,
      paymentMethod: typeof body.payment_method === 'string' && body.payment_method.trim() ? body.payment_method.trim() : null,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    });
    if (result.notFound) return jsonError('Grant not found', 404);
    if (result.error) throw result.error;

    return jsonOk({ payment: result.data }, { status: 201 });
  } catch (error: unknown) {
    return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
  }
}
