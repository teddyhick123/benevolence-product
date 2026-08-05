import type { AssistantToolExecutor } from '../../executor-types';

export const executeListReportTemplates: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const scope = args.scope;
    let query = supabase
      .from('report_templates')
      .select(
        'id, name, description, scope, config, is_default, created_at, updated_at',
      )
      .eq('portfolio_id', portfolioId)
      .order('updated_at', { ascending: false });
    if (scope) {
      if (!['portfolio', 'holding', 'sector'].includes(scope)) {
        throw new Error('scope must be portfolio, holding, or sector');
      }
      query = query.eq('scope', scope);
    }

    const { data: templates, error } = await query;
    if (error) throw error;

    return {
      action: null,
      output: {
        templates: templates ?? [],
        count: templates?.length ?? 0,
      },
    };
  }
};
