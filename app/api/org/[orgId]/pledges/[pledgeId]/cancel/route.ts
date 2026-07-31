import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createPledgeRepository } from '@/lib/api/repositories/pledges';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CancelPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = CancelPledgeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk({ error: parsed.error.issues }, { status: 400 });
    }

    const repository = createPledgeRepository({
      orgId,
      actorId: access.context.principal.userId,
    });
    const { data, error } = await repository.cancelPledge({
      pledgeId,
      cancellationReason: parsed.data.cancellation_reason,
      waivePending: parsed.data.waive_pending ?? false,
    });

    if (error) return jsonError(error.message, 500);

    return jsonOk({ success: true, ...data });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
