import type { AssistantToolExecutor } from '../../executor-types';

export const executeGenerateD3Chart: AssistantToolExecutor = async (
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
    const isPieOrDonut =
      args.chart_type === 'pie' || args.chart_type === 'donut';

    const d3Config = {
      d3: {
        kind: args.chart_type,
        data: args.data,
        encoding: {
          x: args.x_field,
          y: args.y_field,
          ...(args.series_field && { series: args.series_field }),
          ...(isPieOrDonut && { label: args.x_field, value: args.y_field }),
        },
        options: {
          ...(args.x_type === 'time' && { xType: 'time' }),
          ...(args.x_axis_label && { xAxisLabel: args.x_axis_label }),
          ...(args.y_axis_label && { yAxisLabel: args.y_axis_label }),
          ...(args.show_grid !== undefined && { showGrid: args.show_grid }),
          ...(args.colors && { colors: args.colors }),
        },
      },
    };

    const widgetPreview = {
      id: crypto.randomUUID(),
      portfolio_id: portfolioId,
      type: 'd3_json',
      title: args.title,
      config: d3Config,
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
      ai_reasoning: `Created preview d3_json chart: "${args.title}"`,
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
