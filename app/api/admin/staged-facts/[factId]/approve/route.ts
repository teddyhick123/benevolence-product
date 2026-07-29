import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import {
  createAppAdminUploadReviewRepository,
  StagedMetricFactNotFoundError,
} from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ factId: string }> }
) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  try {
    const { factId } = await params;
    if (!factId) return jsonError('factId required', 400);

    await createAppAdminUploadReviewRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).approveStagedFact(factId);
    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof StagedMetricFactNotFoundError) {
      return jsonError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Failed to approve fact';
    return jsonError(message, 500);
  }
}
