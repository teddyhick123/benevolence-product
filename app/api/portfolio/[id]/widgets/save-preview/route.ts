import { NextRequest } from 'next/server';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';
import {
  createPortfolioVisualizationRepository,
  PortfolioWidgetHoldingNotFoundError,
  PortfolioWidgetSaveError,
} from '@/lib/api/repositories/visualizations';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await params;
  const access = await requirePortfolioAccess(portfolioId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    const body = await req.json();
    const { type, title, config, holding_id: holdingId } = body;
    if (!type || !title) return jsonError('type and title are required', 400);

    const widget = await createPortfolioVisualizationRepository({
      portfolioId: access.context.portfolioId,
      actorId: access.context.user.id,
    }).savePreview({
      type,
      title,
      config: config || {},
      holdingId: holdingId || null,
    });

    return jsonOk({ data: widget });
  } catch (error) {
    if (error instanceof PortfolioWidgetHoldingNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof PortfolioWidgetSaveError) {
      return jsonError(error.message, 500);
    }
    const message = error instanceof Error ? error.message : 'Failed to save widget';
    return jsonError(message, 500);
  }
}
