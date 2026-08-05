import type { AssistantToolExecutor } from '../../executor-types';

export const executeGetHoldingDetails: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const { data } = await supabase
      .from('holdings')
      .select('*, metric_facts(*), holding_widgets(*)')
      .eq('id', args.holding_id)
      .eq('portfolio_id', portfolioId)
      .single();

    return {
      action: null,
      output: { holding: data },
    };
  }
};
