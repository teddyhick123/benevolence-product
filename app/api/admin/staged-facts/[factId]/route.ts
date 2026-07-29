import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminUploadReviewRepository } from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function DELETE(
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
    }).rejectStagedFact(factId);
    return jsonOk({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete fact';
    return jsonError(message, 500);
  }
}
