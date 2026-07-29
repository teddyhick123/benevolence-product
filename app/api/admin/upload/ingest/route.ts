import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import {
  AdminUploadHoldingMismatchError,
  AdminUploadNotFoundError,
  createAppAdminUploadIngestionRepository,
} from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { uploadIngestSchema } from '@/lib/schemas/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const validation = uploadIngestSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  try {
    const result = await createAppAdminUploadIngestionRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).ingestExisting(validation.data.uploadId);

    return jsonOk({
      success: true,
      uploadId: result.uploadId,
      factsExtracted: result.factsExtracted,
      locationsExtracted: result.locationsExtracted,
      locationsUpserted: result.locationsUpserted,
      metrics: result.metrics,
      ...(result.documentMetadata ? { documentMetadata: result.documentMetadata } : {}),
      ...(result.message ? { message: result.message } : {}),
    });
  } catch (error) {
    if (error instanceof AdminUploadNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof AdminUploadHoldingMismatchError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : 'Ingestion failed';
    return jsonError(message, 500);
  }
}
