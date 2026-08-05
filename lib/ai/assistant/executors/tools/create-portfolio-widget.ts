import type { AssistantToolExecutor } from '../../executor-types';

export const executeCreatePortfolioWidget: AssistantToolExecutor = async (
  runtime,
) => {
  const {
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  {
    const widgetPreview = {
      id: crypto.randomUUID(),
      portfolio_id: portfolioId,
      type: args.type,
      title: args.title,
      config: args.config || {},
      position: 0,
      is_preview: true,
    };

    const previewAction: any = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      portfolio_id: portfolioId,
      user_id: userId,
      action_type: 'preview',
      entity_type: 'widget',
      entity_id: widgetPreview.id,
      operation_data: {
        table: 'holding_widgets',
        after: widgetPreview,
        is_preview: true,
      },
      ai_reasoning: `Created preview ${args.type} widget: "${args.title}"`,
      user_prompt: userPrompt,
      status: 'preview',
      batch_id: batchId,
      sequence_order: sequenceOrder,
    };

    return {
      action: previewAction,
      output: widgetPreview,
    };
  }
};
