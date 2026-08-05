import type { ToolDefinition } from '@/lib/ai/types';

export const IMPACT_TOOLS: ToolDefinition[] = [
  {
    name: 'add_metric_fact',
    description: 'Add a new metric/KPI fact for a holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
        metric_code: {
          type: 'string',
          description: 'Metric code (e.g., CARBON_EMISSIONS, JOBS_CREATED)',
        },
        value: { type: 'number', description: 'Metric value' },
        unit: { type: 'string', description: 'Unit of measurement (optional)' },
        period_start: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD, optional)',
        },
        period_end: {
          type: 'string',
          description: 'End date (YYYY-MM-DD, optional)',
        },
      },
      required: ['holding_id', 'metric_code', 'value'],
    },
  },
  {
    name: 'create_widget',
    description: 'Create a visualization widget for a holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
        type: {
          type: 'string',
          description:
            'Widget type (e.g., kpi_trend, target_gauge, metric_card)',
        },
        title: { type: 'string', description: 'Widget title' },
        config: {
          type: 'object',
          description: 'Widget configuration (metric_code, target_value, etc.)',
        },
      },
      required: ['holding_id', 'type', 'title'],
    },
  },
  {
    name: 'add_location',
    description: 'Add a geographic location for a holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
        name: {
          type: 'string',
          description: 'Location name (e.g., Headquarters, Project Site)',
        },
        city: { type: 'string', description: 'City name (optional)' },
        country: { type: 'string', description: 'Country name (optional)' },
        lon: { type: 'number', description: 'Longitude (optional)' },
        lat: { type: 'number', description: 'Latitude (optional)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags (optional)',
        },
      },
      required: ['holding_id', 'name'],
    },
  },
  {
    name: 'get_metric_trend',
    description:
      'Get historical trend data for a specific metric across the portfolio or a holding. Returns time series data suitable for visualization.',
    input_schema: {
      type: 'object',
      properties: {
        metric_code: {
          type: 'string',
          description: 'Metric code (e.g., RENEWABLE_MWH, CLIENTS_SERVED)',
        },
        holding_id: {
          type: 'string',
          description:
            'Specific holding ID (optional - if omitted, aggregates across portfolio)',
        },
        window: {
          type: 'string',
          enum: ['3m', '6m', '12m', '24m', 'all'],
          description: 'Time window (default: 12m)',
        },
      },
      required: ['metric_code'],
    },
  },
  {
    name: 'compare_holdings',
    description:
      'Compare multiple holdings on a specific metric. Use for questions like "compare carbon emissions across my holdings" or "which holding has the most clients"',
    input_schema: {
      type: 'object',
      properties: {
        metric_code: { type: 'string', description: 'Metric to compare' },
        holding_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of holding IDs to compare (optional - if omitted, compares all holdings)',
        },
        sort_order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order (default: desc)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of holdings to return (default: 10)',
        },
      },
      required: ['metric_code'],
    },
  },
  {
    name: 'list_widgets',
    description: 'Get a list of all visualization widgets in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of widgets to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'display_widget',
    description:
      'REQUIRED: Display an existing widget inline in the conversation. ALWAYS use this function when users ask to see/show/display a widget. DO NOT use markdown images or text descriptions - call this function to make the actual widget appear. Widget IDs are provided in the system context - look for them there.',
    input_schema: {
      type: 'object',
      properties: {
        widget_id: {
          type: 'string',
          description:
            'UUID of the widget to display (available in the "Existing Widgets" section of the context)',
        },
      },
      required: ['widget_id'],
    },
  },
  {
    name: 'create_portfolio_widget',
    description:
      'Create a visualization widget at the portfolio level. IMPORTANT: You MUST provide a complete config object with ALL required fields for the widget type. See the system prompt for detailed config examples. Common mistake: forgetting metric_code, perUnit, mode, rings, or target fields.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'kpi_trend',
            'radial_progress',
            'people_grid_auto',
            'holdings_pie_auto',
            'emissions_bar',
            'd3_json',
          ],
          description:
            'Widget type: kpi_trend (needs metric_code), radial_progress (needs rings array), people_grid_auto (needs metric_code, perUnit, mode), holdings_pie_auto (auto-fetches holdings, no metric needed)',
        },
        title: {
          type: 'string',
          description:
            'Descriptive widget title (e.g., "Renewable Energy Trend", "Portfolio Allocation")',
        },
        config: {
          type: 'object',
          description:
            'Complete widget configuration object. MUST include all required fields for the widget type. Examples: kpi_trend needs {metric_code, period}, people_grid_auto needs {metric_code, perUnit, mode}, radial_progress needs {rings: [{metric_code, target}]}',
        },
      },
      required: ['type', 'title', 'config'],
    },
  },
  {
    name: 'generate_d3_chart',
    description:
      'Generate a custom D3 visualization from data. Creates polished charts with tooltips, gridlines, and legends. Use this when users request custom charts with specific data. IMPORTANT: Call list_holdings, get_metric_trend, or compare_holdings FIRST to fetch the data, then pass it to this function.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Chart title (e.g., "Funds Allocated by Sector")',
        },
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'area', 'scatter', 'pie', 'donut'],
          description:
            'Chart type: bar (comparisons), line (trends), area (cumulative), scatter (correlations), pie/donut (proportions)',
        },
        data: {
          type: 'array',
          description:
            'Array of data objects. Each object must have fields matching x_field/y_field (or label/value for pie). Example: [{sector: "Energy", funds: 1000000}]',
          items: { type: 'object' },
        },
        x_field: {
          type: 'string',
          description:
            'Field name for x-axis or labels (e.g., "sector", "name", "date")',
        },
        y_field: {
          type: 'string',
          description:
            'Field name for y-axis or values (e.g., "funds_allocated", "value")',
        },
        series_field: {
          type: 'string',
          description:
            'Field name for series grouping (optional, for multi-line charts)',
        },
        x_type: {
          type: 'string',
          enum: ['linear', 'time'],
          description: 'X-axis type (use "time" for dates)',
        },
        x_axis_label: {
          type: 'string',
          description: 'Label for x-axis (e.g., "Sector", "Date")',
        },
        y_axis_label: {
          type: 'string',
          description: 'Label for y-axis (e.g., "Funds ($)", "Count")',
        },
        show_grid: {
          type: 'boolean',
          description: 'Show gridlines (default: true)',
        },
        colors: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of hex colors for chart elements (e.g., ["#3b82f6", "#10b981", "#f59e0b"])',
        },
      },
      required: ['title', 'chart_type', 'data', 'x_field', 'y_field'],
    },
  },
  {
    name: 'get_chart_data',
    description:
      'Fetch and format data specifically for visualization. Returns pre-formatted data with suggested chart type and styling. Use this BEFORE generate_d3_chart to get properly formatted data.',
    input_schema: {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          enum: [
            'holdings_by_sector',
            'holdings_by_country',
            'metric_trend',
            'metric_comparison',
            'allocation_breakdown',
            'status_breakdown',
          ],
          description:
            'Type of data to fetch: holdings_by_sector (pie/bar), metric_trend (line), metric_comparison (bar), allocation_breakdown (pie/donut), status_breakdown (pie)',
        },
        metric_code: {
          type: 'string',
          description:
            'Required for metric_trend and metric_comparison data types',
        },
        window: {
          type: 'string',
          enum: ['3m', '6m', '12m', '24m', 'all'],
          description: 'Time window for trends (default: 12m)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default: 10)',
        },
      },
      required: ['data_type'],
    },
  },
];
