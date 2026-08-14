import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createGrantRepository, type GrantPaymentStatus } from '@/lib/api/repositories/grants';

export const dynamic = 'force-dynamic';

const PAYMENT_STATUSES = new Set<GrantPaymentStatus>([
  'scheduled', 'approved', 'processing', 'completed', 'cancelled', 'returned',
]);

interface RouteParams {
  params: Promise<{ orgId: string; paymentId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, paymentId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const status = body.status;
    if (typeof status !== 'string' || !PAYMENT_STATUSES.has(status as GrantPaymentStatus)) {
      return jsonError('Invalid payment status', 400);
    }

    const repository = createGrantRepository({ orgId, actorId: access.context.user.id });
    const result = await repository.updatePaymentStatus(paymentId, status as GrantPaymentStatus);
    if (result.notFound) return jsonError('Payment not found', 404);
    if (result.error) throw result.error;

    return jsonOk({ payment: result.data });
  } catch (error: unknown) {
    return jsonError(error instanceof Error ? error.message : 'Internal error', 500);
  }
}
