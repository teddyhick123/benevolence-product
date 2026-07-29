import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminUploadReviewRepository } from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  try {
    const { uploadId } = await params;
    if (!uploadId) return jsonError('uploadId required', 400);

    const facts = await createAppAdminUploadReviewRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).listStagedFacts(uploadId);
    return jsonOk({ facts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch staged facts';
    return jsonError(message, 500);
  }
}
