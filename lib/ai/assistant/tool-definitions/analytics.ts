import type { ToolDefinition } from '@/lib/ai/types';

export const ANALYTICS_TOOLS: ToolDefinition[] = [
  // ==================== ANALYTICS MODULE ====================
  {
    name: 'project_metric_trend',
    description: 'Project future values of a metric with confidence intervals',
    input_schema: {
      type: 'object',
      properties: {
        metric_code: {
          type: 'string',
          description: 'Metric code to project',
        },
        holding_id: {
          type: 'string',
          description:
            'Holding ID (optional - if omitted, projects portfolio-wide)',
        },
        periods_ahead: {
          type: 'number',
          description: 'Number of periods to project (default: 4)',
        },
        method: {
          type: 'string',
          enum: ['linear', 'exponential', 'moving_average'],
          description: 'Projection method (default: linear)',
        },
      },
      required: ['metric_code'],
    },
  },
  {
    name: 'benchmark_holding',
    description: 'Compare a holding against sector or size-band peers',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to benchmark',
        },
        benchmark_type: {
          type: 'string',
          enum: ['sector', 'size', 'geography'],
          description: 'Type of benchmark comparison',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Metrics to compare (optional - uses defaults if not specified)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'analyze_portfolio_risk',
    description: 'Analyze portfolio concentration and diversification risk',
    input_schema: {
      type: 'object',
      properties: {
        risk_type: {
          type: 'string',
          enum: ['concentration', 'sector', 'geography', 'all'],
          description: 'Type of risk analysis (default: all)',
        },
      },
    },
  },
];
