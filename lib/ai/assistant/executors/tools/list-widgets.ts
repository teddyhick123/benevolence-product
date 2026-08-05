import type { AssistantToolExecutor } from '../../executor-types';

export const executeListWidgets: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const limit = args.limit || 50;
    const { data } = await supabase
      .from('widgets')
      .select('id, type, title, config, position, created_at')
      .eq('portfolio_id', portfolioId)
      .order('position', { ascending: true })
      .limit(limit);

    return {
      action: null,
      output: {
        widgets: data || [],
        count: data?.length || 0,
      },
    };
  }
};
