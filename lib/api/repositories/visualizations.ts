import { createElevatedClient } from '@/lib/api/admin-client';
import type { PortfolioAccessContext } from '@/lib/api/principals';

type VisualizationScope = Pick<PortfolioAccessContext, 'portfolioId'> & {
  actorId: string;
};

export class PortfolioWidgetHoldingNotFoundError extends Error {
  constructor() {
    super('Holding not found');
    this.name = 'PortfolioWidgetHoldingNotFoundError';
  }
}

export class PortfolioWidgetSaveError extends Error {
  constructor() {
    super('Failed to save widget');
    this.name = 'PortfolioWidgetSaveError';
  }
}

/** Elevated visualization writes constrained to one authorized portfolio. */
export function createPortfolioVisualizationRepository(scope: VisualizationScope) {
  const db = createElevatedClient();

  return {
    async savePreview(input: {
      type: string;
      title: string;
      config: Record<string, unknown>;
      holdingId?: string | null;
    }) {
      let maxPosition = -1;
      if (input.holdingId) {
        const { data: holding, error: holdingError } = await db
          .from('holdings')
          .select('id')
          .eq('id', input.holdingId)
          .eq('portfolio_id', scope.portfolioId)
          .is('deleted_at', null)
          .maybeSingle();
        if (holdingError) throw holdingError;
        if (!holding) throw new PortfolioWidgetHoldingNotFoundError();

        const { data: widgets, error: widgetsError } = await db
          .from('holding_widgets')
          .select('position')
          .eq('holding_id', input.holdingId)
          .order('position', { ascending: false })
          .limit(1);
        if (widgetsError) throw widgetsError;
        maxPosition = widgets?.[0]?.position ?? -1;

        const { data, error } = await db
          .from('holding_widgets')
          .insert({
            holding_id: input.holdingId,
            type: input.type,
            title: input.title,
            config: input.config,
            position: maxPosition + 1,
          })
          .select()
          .single();
        if (error) throw new PortfolioWidgetSaveError();
        return data;
      }

      const { data: widgets, error: widgetsError } = await db
        .from('widgets')
        .select('position')
        .eq('portfolio_id', scope.portfolioId)
        .order('position', { ascending: false })
        .limit(1);
      if (widgetsError) throw widgetsError;
      maxPosition = widgets?.[0]?.position ?? -1;

      const { data, error } = await db
        .from('widgets')
        .insert({
          portfolio_id: scope.portfolioId,
          type: input.type,
          title: input.title,
          config: input.config,
          position: maxPosition + 1,
        })
        .select()
        .single();
      if (error) throw new PortfolioWidgetSaveError();
      return data;
    },
  };
}
