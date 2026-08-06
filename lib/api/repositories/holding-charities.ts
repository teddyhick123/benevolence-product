import type { HoldingAccessContext } from '@/lib/api/principals';

/**
 * Holding linkage constrained to one proven holding. Global registry writes are
 * available only through the narrow link_holding_to_charity database function.
 */
export function createHoldingCharityRepository(scope: HoldingAccessContext) {
  const db = scope.db;
  const holdingId = scope.holdingId;
  const portfolioId = scope.portfolioId;

  async function scopedHolding() {
    const { data, error } = await db
      .from('holdings')
      .select('id, name, investee_id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return data;
  }

  async function findCharityById(charityId: string) {
    const { data, error } = await db.from('charities').select('*').eq('id', charityId).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    findCharityById,

    async findCharityByEin(ein: string) {
      const { data, error } = await db.from('charities').select('*').eq('ein', ein).maybeSingle();
      if (error) throw error;
      return data;
    },

    async link(charityId: string) {
      const [holding, charity] = await Promise.all([
        scopedHolding(),
        findCharityById(charityId),
      ]);
      if (!charity) throw new Error('Charity not found');

      const { data: investeeId, error: linkError } = await db.rpc('link_holding_to_charity', {
        p_holding_id: holding.id,
        p_portfolio_id: portfolioId,
        p_charity_id: charity.id,
      });
      if (linkError) throw linkError;

      return {
        holding: { ...holding, investee_id: investeeId, charity_id: charity.id },
        charity,
      };
    },

    async unlink() {
      const holding = await scopedHolding();
      const { error } = await db
        .from('holdings')
        .update({ investee_id: null })
        .eq('id', holding.id)
        .eq('portfolio_id', portfolioId);
      if (error) throw error;
    },
  };
}
