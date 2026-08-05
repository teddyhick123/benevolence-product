import type { AssistantToolExecutor } from '../../executor-types';

export const executeListHoldings: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    let holdingsQuery = supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId);
    if (args.status) {
      holdingsQuery = holdingsQuery.eq('status', args.status);
    }
    const { data } = await holdingsQuery;

    return {
      action: null,
      output: { holdings: data || [] },
    };
  }
};
