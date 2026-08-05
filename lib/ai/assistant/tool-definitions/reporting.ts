import type { ToolDefinition } from '@/lib/ai/types';

export const REPORTING_TOOLS: ToolDefinition[] = [
  {
    name: 'generate_holding_report',
    description:
      'Generate a comprehensive report about a specific holding/charity with inline charts. Fetches all holding data, charity info, and metric history, then auto-generates relevant chart visualizations. Returns content_blocks array with interleaved text and chart widgets.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description:
            'UUID of the holding to report on (find in HOLDINGS section)',
        },
        metric_codes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific metric codes to include in report (optional - if empty, auto-selects all available)',
        },
        chart_preferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              metric_code: { type: 'string' },
              chart_type: {
                type: 'string',
                enum: ['line', 'bar', 'area', 'pie', 'gauge'],
              },
            },
          },
          description: 'Chart type preferences for specific metrics (optional)',
        },
        include_sections: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['overview', 'financials', 'impact', 'trends'],
          },
          description:
            'Sections to include in report (optional - default: all)',
        },
        time_range: {
          type: 'string',
          enum: ['3m', '6m', '12m', 'ytd', 'all'],
          description: 'Time range for metric data (default: all)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'generate_custom_report',
    description:
      'Generate a custom report with user-specified metrics, chart types, and sections. Returns content_blocks array with interleaved text and chart widgets for inline rendering.',
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['portfolio', 'holding', 'sector'],
          description:
            'Report scope: portfolio (entire portfolio), holding (specific holding), or sector (sector-based analysis)',
        },
        holding_id: {
          type: 'string',
          description: 'Required if scope is "holding" - UUID of the holding',
        },
        sector: {
          type: 'string',
          description: 'Required if scope is "sector" - sector name to analyze',
        },
        metric_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific metric codes to include',
        },
        chart_preferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              metric_code: { type: 'string' },
              chart_type: {
                type: 'string',
                enum: ['line', 'bar', 'area', 'pie', 'gauge'],
              },
            },
          },
          description: 'Chart type preferences for specific metrics',
        },
        include_sections: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['overview', 'financials', 'impact', 'trends', 'comparison'],
          },
          description: 'Sections to include in report',
        },
        time_range: {
          type: 'string',
          enum: ['3m', '6m', '12m', 'ytd', 'all'],
          description: 'Time range for metric data (default: 12m)',
        },
        title: {
          type: 'string',
          description: 'Custom report title (optional)',
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'save_report_template',
    description:
      'Save a report configuration as a reusable template for future report generation',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Name for the template (e.g., "Quarterly Impact Report")',
        },
        scope: {
          type: 'string',
          enum: ['portfolio', 'holding', 'sector'],
          description: 'Report scope',
        },
        config: {
          type: 'object',
          description:
            'Report configuration including metric_codes, chart_preferences, include_sections, time_range',
          properties: {
            metric_codes: { type: 'array', items: { type: 'string' } },
            chart_preferences: { type: 'array' },
            include_sections: { type: 'array', items: { type: 'string' } },
            time_range: { type: 'string' },
          },
        },
        is_default: {
          type: 'boolean',
          description: 'Set as default template for this scope (optional)',
        },
      },
      required: ['name', 'scope', 'config'],
    },
  },
  {
    name: 'list_report_templates',
    description: 'List available report templates for the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['portfolio', 'holding', 'sector'],
          description: 'Filter by scope (optional)',
        },
      },
    },
  },
  {
    name: 'export_data',
    description:
      'Export portfolio or holding data to CSV, Excel, or JSON format',
    input_schema: {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          enum: ['holdings', 'metrics', 'transactions', 'contributions'],
          description: 'Type of data to export',
        },
        format: {
          type: 'string',
          enum: ['csv', 'xlsx', 'json'],
          description: 'Export format (default: csv)',
        },
        holding_id: {
          type: 'string',
          description:
            'Specific holding ID to export (optional - if omitted, exports all)',
        },
        date_from: {
          type: 'string',
          description: 'Start date for filtering (YYYY-MM-DD, optional)',
        },
        date_to: {
          type: 'string',
          description: 'End date for filtering (YYYY-MM-DD, optional)',
        },
      },
      required: ['data_type'],
    },
  },
];
