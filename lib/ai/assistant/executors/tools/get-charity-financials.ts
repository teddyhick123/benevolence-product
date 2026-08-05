import type { AssistantToolExecutor } from '../../executor-types';

export const executeGetCharityFinancials: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const holdingId = args.holding_id;
    const ein = args.ein;

    let targetEin = ein;

    if (holdingId && !ein) {
      const { data: holding } = await supabase
        .from('holdings')
        .select('ein')
        .eq('id', holdingId)
        .eq('portfolio_id', portfolioId)
        .single();

      targetEin = holding?.ein;
    }

    if (targetEin) {
      const { data: charity } = await supabase
        .from('charities')
        .select('*')
        .eq('ein', targetEin)
        .single();

      if (charity) {
        return {
          action: null,
          output: {
            source: 'database',
            financials: {
              ein: charity.ein,
              name: charity.name,
              total_revenue: charity.total_revenue,
              total_expenses: charity.total_expenses,
              net_assets: charity.net_assets,
              charity_navigator_score: charity.charity_navigator_score,
              charity_navigator_rating: charity.charity_navigator_rating,
            },
          },
        };
      }
    }

    return {
      action: null,
      output: {
        error: 'No financial data found. Try refreshing charity data first.',
      },
    };
  }
};
