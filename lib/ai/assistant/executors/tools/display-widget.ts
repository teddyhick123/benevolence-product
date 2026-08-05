import type { AssistantToolExecutor } from '../../executor-types';

export const executeDisplayWidget: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const { data: widget } = await supabase
      .from('widgets')
      .select('id, type, title, config, position, portfolio_id')
      .eq('id', args.widget_id)
      .eq('portfolio_id', portfolioId)
      .maybeSingle();

    if (!widget) {
      throw new Error(`Widget with ID ${args.widget_id} not found`);
    }

    return {
      action: null,
      output: {
        widget,
        displayed: true,
      },
    };
  }
};
