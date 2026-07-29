import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import {
  AdminUploadHoldingMismatchError,
  createAppAdminUploadIngestionRepository,
} from '@/lib/api/repositories/admin-uploads';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('No file', 400);
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(
        `File too large. Maximum size is 200MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        400
      );
    }

    const portfolioId = String(form.get('portfolio_id') || '');
    const holdingId = String(form.get('holding_id') || '');
    const aiMode = String(form.get('ai_mode') ?? 'true') === 'true';
    const selectedMetrics = String(form.get('selected_metrics') || '')
      .split(',')
      .map((metric) => metric.trim())
      .filter(Boolean);
    if (!portfolioId) return jsonError('portfolio_id required', 400);
    if (!holdingId) return jsonError('holding_id required', 400);

    const result = await createAppAdminUploadIngestionRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).createAndIngest({
      fileName: file.name,
      mimeType: file.type || null,
      buffer: Buffer.from(await file.arrayBuffer()),
      portfolioId,
      holdingId,
      aiMode,
      selectedMetrics,
    });

    return jsonOk({
      uploadId: result.uploadId,
      portfolio_id: result.portfolioId,
      holding_id: result.holdingId,
      factsExtracted: result.factsExtracted,
      locationsExtracted: result.locationsUpserted,
      chunksProcessed: result.chunksProcessed,
      metrics: result.metrics,
      ...(result.message ? { message: result.message } : {}),
    });
  } catch (error) {
    if (error instanceof AdminUploadHoldingMismatchError) {
      return jsonError(error.message, 400);
    }
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, 500);
  }
}
