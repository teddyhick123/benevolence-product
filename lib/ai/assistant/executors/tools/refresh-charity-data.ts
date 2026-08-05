import type { AssistantToolExecutor } from '../../executor-types';

export const executeRefreshCharityData: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const holdingId = args.holding_id;
    const ein = args.ein;

    let targetEin = ein;
    let holdingName = '';

    // If holdingId provided, look up the EIN
    if (holdingId && !ein) {
      const { data: holding, error } = await supabase
        .from('holdings')
        .select('name, ein')
        .eq('id', holdingId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (error) throw new Error(`Holding not found: ${error.message}`);
      holdingName = holding?.name || '';
      targetEin = holding?.ein;
    }

    if (!targetEin) {
      return {
        action: null,
        output: {
          error:
            'No EIN found for this holding. Link the holding to a charity first.',
          success: false,
        },
      };
    }

    // Fetch from external sources (simplified - actual implementation would use the services)
    const charityData: any = {
      ein: targetEin,
      refreshed_at: new Date().toISOString(),
    };

    const { data: charity } = await supabase
      .from('charities')
      .select(
        'ein, name, charity_navigator_score, charity_navigator_rating, give_well_top_charity, candid_seal, propublica_score, total_revenue, total_expenses, net_assets',
      )
      .eq('ein', targetEin)
      .maybeSingle();

    if (charity) {
      charityData.ratings = {
        charity_navigator_score: charity.charity_navigator_score,
        charity_navigator_rating: charity.charity_navigator_rating,
        give_well_top_charity: charity.give_well_top_charity,
        candid_seal: charity.candid_seal,
        propublica_score: charity.propublica_score,
      };
      charityData.financials = {
        total_revenue: charity.total_revenue,
        total_expenses: charity.total_expenses,
        net_assets: charity.net_assets,
      };
      charityData.source = 'cache';
    } else {
      charityData.message = 'No charity data found for this EIN.';
      charityData.source = 'none';
    }

    return {
      action: null,
      output: {
        success: true,
        holding_name: holdingName,
        ein: targetEin,
        data: charityData,
      },
    };
  }
};
