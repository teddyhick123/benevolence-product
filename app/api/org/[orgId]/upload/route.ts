import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  AdminUploadHoldingMismatchError,
  createOrgUploadIngestionRepository,
} from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const MAX_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    const form = await req.formData();
    const file = form.get('file');
    const holdingId = String(form.get('holding_id') || '');
    const aiMode = String(form.get('ai_mode') ?? 'true') === 'true';

    if (!(file instanceof File)) return jsonError('No file provided', 400);
    if (!holdingId) return jsonError('holding_id is required', 400);
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(
        `File too large. Maximum size is 200MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        400
      );
    }

    const result = await createOrgUploadIngestionRepository({
      orgId: access.context.orgId,
      actorId: access.context.user.id,
    }).createAndIngest({
      fileName: file.name,
      mimeType: file.type || null,
      buffer: Buffer.from(await file.arrayBuffer()),
      holdingId,
      aiMode,
    });

    if (!aiMode) {
      return jsonOk({
        uploadId: result.uploadId,
        factsExtracted: 0,
        message: 'File uploaded. AI extraction was disabled.',
      });
    }
    if (result.factsExtracted === 0) {
      return jsonOk({
        uploadId: result.uploadId,
        factsExtracted: 0,
        chunksProcessed: result.chunksProcessed,
        message: result.chunksProcessed === 0
          ? 'No readable content found in document.'
          : 'No metrics found in document.',
      });
    }

    return jsonOk({
      uploadId: result.uploadId,
      factsExtracted: result.factsExtracted,
      chunksProcessed: result.chunksProcessed,
      message: `Extracted ${result.factsExtracted} metrics. Pending portfolio owner approval.`,
    });
  } catch (error) {
    if (error instanceof AdminUploadHoldingMismatchError) {
      return jsonError('Holding does not belong to this organization', 400);
    }
    const message = error instanceof Error ? error.message : 'Upload failed';
    return jsonError(message, 500);
  }
}
