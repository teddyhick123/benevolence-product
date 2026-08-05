import type { AssistantToolExecutor } from '../../executor-types';

export const executeSaveReportTemplate: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, userId } = runtime;
  {
    const name = args.name;
    const scope = args.scope;
    const config = args.config;
    const isDefault = args.is_default === true;

    if (!name || typeof name !== 'string') {
      throw new Error('name is required');
    }
    if (!['portfolio', 'holding', 'sector'].includes(scope)) {
      throw new Error('scope must be portfolio, holding, or sector');
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('config must be an object');
    }

    if (isDefault) {
      const { error: clearDefaultError } = await supabase
        .from('report_templates')
        .update({ is_default: false })
        .eq('portfolio_id', portfolioId)
        .eq('scope', scope);
      if (clearDefaultError) throw clearDefaultError;
    }

    const { data: template, error } = await supabase
      .from('report_templates')
      .insert({
        portfolio_id: portfolioId,
        created_by: userId,
        name: name.slice(0, 160),
        description:
          typeof args.description === 'string'
            ? args.description.slice(0, 1000)
            : null,
        scope,
        config,
        is_default: isDefault,
      })
      .select('id, name, scope, config, is_default')
      .single();
    if (error) throw error;

    return {
      action: null,
      output: {
        success: true,
        template,
        message: `Saved report template "${template.name}".`,
      },
    };
  }
};
