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
      // Position allocation happens inside the RPC, under an advisory lock per
      // dashboard. Reading MAX(position) here and inserting max+1 let two
      // concurrent callers land on the same slot.
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

        const { data, error } = await db.rpc('create_holding_widget', {
          p_holding_id: input.holdingId,
          p_type: input.type,
          p_title: input.title,
          p_config: input.config as never,
        });
        if (error) throw new PortfolioWidgetSaveError();
        return data;
      }

      const { data, error } = await db.rpc('create_portfolio_widget', {
        p_portfolio_id: scope.portfolioId,
        p_type: input.type,
        p_title: input.title,
        p_config: input.config as never,
      });
      if (error) throw new PortfolioWidgetSaveError();
      return data;
    },

    /** Swap two widgets' positions in one transaction. */
    async swapPositions(input: { widgetA: string; widgetB: string; holdingId?: string | null }) {
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

        const { data, error } = await db.rpc('swap_holding_widget_positions', {
          p_holding_id: input.holdingId,
          p_widget_a: input.widgetA,
          p_widget_b: input.widgetB,
        });
        if (error) throw new PortfolioWidgetSaveError();
        return data;
      }

      const { data, error } = await db.rpc('swap_portfolio_widget_positions', {
        p_portfolio_id: scope.portfolioId,
        p_widget_a: input.widgetA,
        p_widget_b: input.widgetB,
      });
      if (error) throw new PortfolioWidgetSaveError();
      return data;
    },
  };
}
