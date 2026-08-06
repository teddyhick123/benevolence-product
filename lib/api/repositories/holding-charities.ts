import { createElevatedClient } from '@/lib/api/admin-client';
import type { HoldingAccessContext } from '@/lib/api/principals';
import type { Database } from '@/lib/database.types';

type CharityInsert = Database['public']['Tables']['charities']['Insert'];

/**
 * Elevated global-catalog writes and holding linkage constrained to one holding
 * whose portfolio/org access has already been proven by requireHoldingAccess.
 */
export function createHoldingCharityRepository(scope: HoldingAccessContext) {
  const db = createElevatedClient();
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

    async createCharity(charity: CharityInsert) {
      const { data, error } = await db.from('charities').insert(charity).select('*').single();
      if (error) throw error;
      return data;
    },

    async link(charityId: string) {
      const [holding, charity] = await Promise.all([
        scopedHolding(),
        findCharityById(charityId),
      ]);
      if (!charity) throw new Error('Charity not found');

      const { data: existingInvestee, error: investeeLookupError } = await db
        .from('investees')
        .select('id, charity_id')
        .or(`charity_id.eq.${charity.id},ein.eq.${charity.ein}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (investeeLookupError) throw investeeLookupError;

      let investeeId = existingInvestee?.id;
      if (existingInvestee) {
        if (existingInvestee.charity_id !== charity.id) {
          const { error } = await db
            .from('investees')
            .update({ charity_id: charity.id })
            .eq('id', existingInvestee.id);
          if (error) throw error;
        }
      } else {
        const { data: investee, error } = await db
          .from('investees')
          .insert({
            display_name: charity.name,
            ein: charity.ein,
            sector: charity.ntee_code,
            city: charity.city,
            state: charity.state,
            country: charity.country ?? 'US',
            website: charity.website,
            charity_id: charity.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        investeeId = investee.id;
      }

      const { data: updatedHolding, error: updateError } = await db
        .from('holdings')
        .update({ investee_id: investeeId })
        .eq('id', holding.id)
        .eq('portfolio_id', portfolioId)
        .select('id, name, investee_id')
        .single();
      if (updateError) throw updateError;

      return {
        holding: { ...updatedHolding, charity_id: charity.id },
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
