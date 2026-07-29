import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import {
  AdminUploadNotFoundError,
  createAppAdminUploadReviewRepository,
} from '@/lib/api/repositories/admin-uploads';
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

    const status = await createAppAdminUploadReviewRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).getUploadStatus(uploadId);
    return jsonOk(status);
  } catch (error) {
    if (error instanceof AdminUploadNotFoundError) {
      return jsonError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Failed to check status';
    return jsonError(message, 500);
  }
}
