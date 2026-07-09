import type { ToolDefinition } from '@/lib/ai/types';
import { CUSTOM_FIELD_ENTITY_TYPES } from '@/lib/custom-fields';
import { ORG_AI_CONTEXT_TYPES } from '@/lib/org-ai-context';

// Provider-neutral tool definitions. The active AI provider adapts these to
// its native function/tool-calling format.
// Exported for use by module filtering system
export const PORTFOLIO_TOOLS: ToolDefinition[] = [
  {
    name: 'add_holding',
    description: 'Create a new holding/investment in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the holding' },
        sector: { type: 'string', description: 'Industry sector (optional)' },
        country: { type: 'string', description: 'Country of operation (optional)' },
        funds_allocated: { type: 'number', description: 'Amount invested in USD (optional)' },
        status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'], description: 'Status of the holding (optional)' },
        description: { type: 'string', description: 'Description of the holding (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_holding',
    description: 'Update an existing holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding to update' },
        changes: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            name: { type: 'string' },
            sector: { type: 'string' },
            country: { type: 'string' },
            funds_allocated: { type: 'number' },
            status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'] },
            description: { type: 'string' },
          },
        },
      },
      required: ['holding_id', 'changes'],
    },
  },
  {
    name: 'remove_holding',
    description: 'Delete a holding from the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding to remove' },
        reason: { type: 'string', description: 'Reason for removal (optional)' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'add_metric_fact',
    description: 'Add a new metric/KPI fact for a holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
        metric_code: { type: 'string', description: 'Metric code (e.g., CARBON_EMISSIONS, JOBS_CREATED)' },
        value: { type: 'number', description: 'Metric value' },
        unit: { type: 'string', description: 'Unit of measurement (optional)' },
        period_start: { type: 'string', description: 'Start date (YYYY-MM-DD, optional)' },
        period_end: { type: 'string', description: 'End date (YYYY-MM-DD, optional)' },
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
        type: { type: 'string', description: 'Widget type (e.g., kpi_trend, target_gauge, metric_card)' },
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
        name: { type: 'string', description: 'Location name (e.g., Headquarters, Project Site)' },
        city: { type: 'string', description: 'City name (optional)' },
        country: { type: 'string', description: 'Country name (optional)' },
        lon: { type: 'number', description: 'Longitude (optional)' },
        lat: { type: 'number', description: 'Latitude (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional)' },
      },
      required: ['holding_id', 'name'],
    },
  },
  {
    name: 'list_holdings',
    description: 'Get a list of all holdings in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'], description: 'Filter by status (optional)' },
      },
    },
  },
  {
    name: 'search_holdings',
    description: 'Search and filter holdings by multiple criteria. Use this for queries like "find all solar holdings" or "holdings with allocation over 1M"',
    input_schema: {
      type: 'object',
      properties: {
        sector: { type: 'string', description: 'Filter by sector (partial match)' },
        country: { type: 'string', description: 'Filter by country' },
        status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'], description: 'Filter by status' },
        min_allocation: { type: 'number', description: 'Minimum funds allocated' },
        max_allocation: { type: 'number', description: 'Maximum funds allocated' },
        name_contains: { type: 'string', description: 'Filter by name (partial match)' },
      },
    },
  },
  {
    name: 'get_metric_trend',
    description: 'Get historical trend data for a specific metric across the portfolio or a holding. Returns time series data suitable for visualization.',
    input_schema: {
      type: 'object',
      properties: {
        metric_code: { type: 'string', description: 'Metric code (e.g., RENEWABLE_MWH, CLIENTS_SERVED)' },
        holding_id: { type: 'string', description: 'Specific holding ID (optional - if omitted, aggregates across portfolio)' },
        window: { type: 'string', enum: ['3m', '6m', '12m', '24m', 'all'], description: 'Time window (default: 12m)' },
      },
      required: ['metric_code'],
    },
  },
  {
    name: 'compare_holdings',
    description: 'Compare multiple holdings on a specific metric. Use for questions like "compare carbon emissions across my holdings" or "which holding has the most clients"',
    input_schema: {
      type: 'object',
      properties: {
        metric_code: { type: 'string', description: 'Metric to compare' },
        holding_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of holding IDs to compare (optional - if omitted, compares all holdings)',
        },
        sort_order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default: desc)' },
        limit: { type: 'number', description: 'Maximum number of holdings to return (default: 10)' },
      },
      required: ['metric_code'],
    },
  },
  {
    name: 'get_portfolio_summary',
    description: 'Get a comprehensive summary of portfolio performance including KPIs, sector breakdown, and top holdings. Use for questions like "how is the portfolio doing?" or "give me an overview"',
    input_schema: {
      type: 'object',
      properties: {
        include_kpis: { type: 'boolean', description: 'Include KPI performance (default: true)' },
        include_sectors: { type: 'boolean', description: 'Include sector breakdown (default: true)' },
        include_top_holdings: { type: 'boolean', description: 'Include top holdings by allocation (default: true)' },
      },
    },
  },
  {
    name: 'get_holding_details',
    description: 'Get detailed information about a specific holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_custom_fields',
    description: 'Get AI-readable custom field definitions and current values for a grant, holding, donor, or contribution.',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: [...CUSTOM_FIELD_ENTITY_TYPES],
          description: 'Entity type that owns the custom fields.',
        },
        entity_id: {
          type: 'string',
          description: 'UUID of the entity.',
        },
      },
      required: ['entity_type', 'entity_id'],
    },
  },
  {
    name: 'search_custom_field_values',
    description: 'Find entities by an AI-readable custom field value. Use for questions like "active grants with alignment score below 3".',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: [...CUSTOM_FIELD_ENTITY_TYPES],
          description: 'Entity type to search.',
        },
        field_key: {
          type: 'string',
          description: 'Custom field key, e.g. strategic_alignment_score.',
        },
        operator: {
          type: 'string',
          enum: ['eq', 'contains', 'lt', 'lte', 'gt', 'gte'],
          description: 'Comparison operator. Numeric/date fields support lt/lte/gt/gte; text supports contains/eq.',
        },
        value: {
          type: ['string', 'number', 'boolean'],
          description: 'Value to compare against.',
        },
        lifecycle_stage: {
          type: 'string',
          description: 'Optional grant lifecycle stage filter when entity_type is grant.',
        },
        limit: {
          type: 'number',
          description: 'Maximum matches to return (default 25, max 100).',
        },
      },
      required: ['entity_type', 'field_key', 'operator', 'value'],
    },
  },
  {
    name: 'suggest_context_entry',
    description: 'Persist an org-specific AI context entry after explicit user confirmation or a direct "remember this" request. Do not call this tool merely because you noticed a pattern; ask for confirmation first.',
    input_schema: {
      type: 'object',
      properties: {
        context_type: {
          type: 'string',
          enum: [...ORG_AI_CONTEXT_TYPES],
          description: 'Kind of context to remember.',
        },
        context_key: {
          type: 'string',
          description: 'Stable snake_case key, e.g. grant_vocabulary or site_visit_policy.',
        },
        context_value: {
          type: 'string',
          description: 'Human-readable context the assistant should apply in future sessions.',
        },
        reasoning: {
          type: 'string',
          description: 'Why this context is useful to remember.',
        },
      },
      required: ['context_type', 'context_key', 'context_value', 'reasoning'],
    },
  },
  {
    name: 'list_widgets',
    description: 'Get a list of all visualization widgets in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of widgets to return (default: 50)' },
      },
    },
  },
  {
    name: 'display_widget',
    description: 'REQUIRED: Display an existing widget inline in the conversation. ALWAYS use this function when users ask to see/show/display a widget. DO NOT use markdown images or text descriptions - call this function to make the actual widget appear. Widget IDs are provided in the system context - look for them there.',
    input_schema: {
      type: 'object',
      properties: {
        widget_id: { type: 'string', description: 'UUID of the widget to display (available in the "Existing Widgets" section of the context)' },
      },
      required: ['widget_id'],
    },
  },
  {
    name: 'create_portfolio_widget',
    description: 'Create a visualization widget at the portfolio level. IMPORTANT: You MUST provide a complete config object with ALL required fields for the widget type. See the system prompt for detailed config examples. Common mistake: forgetting metric_code, perUnit, mode, rings, or target fields.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['kpi_trend', 'radial_progress', 'people_grid_auto', 'holdings_pie_auto', 'emissions_bar', 'd3_json'],
          description: 'Widget type: kpi_trend (needs metric_code), radial_progress (needs rings array), people_grid_auto (needs metric_code, perUnit, mode), holdings_pie_auto (auto-fetches holdings, no metric needed)',
        },
        title: { type: 'string', description: 'Descriptive widget title (e.g., "Renewable Energy Trend", "Portfolio Allocation")' },
        config: {
          type: 'object',
          description: 'Complete widget configuration object. MUST include all required fields for the widget type. Examples: kpi_trend needs {metric_code, period}, people_grid_auto needs {metric_code, perUnit, mode}, radial_progress needs {rings: [{metric_code, target}]}',
        },
      },
      required: ['type', 'title', 'config'],
    },
  },
  {
    name: 'generate_d3_chart',
    description: 'Generate a custom D3 visualization from data. Creates polished charts with tooltips, gridlines, and legends. Use this when users request custom charts with specific data. IMPORTANT: Call list_holdings, get_metric_trend, or compare_holdings FIRST to fetch the data, then pass it to this function.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Chart title (e.g., "Funds Allocated by Sector")' },
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'area', 'scatter', 'pie', 'donut'],
          description: 'Chart type: bar (comparisons), line (trends), area (cumulative), scatter (correlations), pie/donut (proportions)',
        },
        data: {
          type: 'array',
          description: 'Array of data objects. Each object must have fields matching x_field/y_field (or label/value for pie). Example: [{sector: "Energy", funds: 1000000}]',
          items: { type: 'object' },
        },
        x_field: { type: 'string', description: 'Field name for x-axis or labels (e.g., "sector", "name", "date")' },
        y_field: { type: 'string', description: 'Field name for y-axis or values (e.g., "funds_allocated", "value")' },
        series_field: { type: 'string', description: 'Field name for series grouping (optional, for multi-line charts)' },
        x_type: { type: 'string', enum: ['linear', 'time'], description: 'X-axis type (use "time" for dates)' },
        x_axis_label: { type: 'string', description: 'Label for x-axis (e.g., "Sector", "Date")' },
        y_axis_label: { type: 'string', description: 'Label for y-axis (e.g., "Funds ($)", "Count")' },
        show_grid: { type: 'boolean', description: 'Show gridlines (default: true)' },
        colors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of hex colors for chart elements (e.g., ["#3b82f6", "#10b981", "#f59e0b"])',
        },
      },
      required: ['title', 'chart_type', 'data', 'x_field', 'y_field'],
    },
  },
  {
    name: 'get_chart_data',
    description: 'Fetch and format data specifically for visualization. Returns pre-formatted data with suggested chart type and styling. Use this BEFORE generate_d3_chart to get properly formatted data.',
    input_schema: {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          enum: ['holdings_by_sector', 'holdings_by_country', 'metric_trend', 'metric_comparison', 'allocation_breakdown', 'status_breakdown'],
          description: 'Type of data to fetch: holdings_by_sector (pie/bar), metric_trend (line), metric_comparison (bar), allocation_breakdown (pie/donut), status_breakdown (pie)',
        },
        metric_code: {
          type: 'string',
          description: 'Required for metric_trend and metric_comparison data types',
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
  {
    name: 'generate_holding_report',
    description: 'Generate a comprehensive report about a specific holding/charity with inline charts. Fetches all holding data, charity info, and metric history, then auto-generates relevant chart visualizations. Returns content_blocks array with interleaved text and chart widgets.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding to report on (find in HOLDINGS section)' },
        metric_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific metric codes to include in report (optional - if empty, auto-selects all available)',
        },
        chart_preferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              metric_code: { type: 'string' },
              chart_type: { type: 'string', enum: ['line', 'bar', 'area', 'pie', 'gauge'] },
            },
          },
          description: 'Chart type preferences for specific metrics (optional)',
        },
        include_sections: {
          type: 'array',
          items: { type: 'string', enum: ['overview', 'financials', 'impact', 'trends'] },
          description: 'Sections to include in report (optional - default: all)',
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
    description: 'Generate a custom report with user-specified metrics, chart types, and sections. Returns content_blocks array with interleaved text and chart widgets for inline rendering.',
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['portfolio', 'holding', 'sector'],
          description: 'Report scope: portfolio (entire portfolio), holding (specific holding), or sector (sector-based analysis)',
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
              chart_type: { type: 'string', enum: ['line', 'bar', 'area', 'pie', 'gauge'] },
            },
          },
          description: 'Chart type preferences for specific metrics',
        },
        include_sections: {
          type: 'array',
          items: { type: 'string', enum: ['overview', 'financials', 'impact', 'trends', 'comparison'] },
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
    description: 'Save a report configuration as a reusable template for future report generation',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the template (e.g., "Quarterly Impact Report")' },
        scope: {
          type: 'string',
          enum: ['portfolio', 'holding', 'sector'],
          description: 'Report scope',
        },
        config: {
          type: 'object',
          description: 'Report configuration including metric_codes, chart_preferences, include_sections, time_range',
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
    description: 'Export portfolio or holding data to CSV, Excel, or JSON format',
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
          description: 'Specific holding ID to export (optional - if omitted, exports all)',
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
  // ==================== EXTERNAL DATA MODULE ====================
  {
    name: 'refresh_charity_data',
    description: 'Fetch latest data from Charity Navigator and Candid for a holding/charity',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to refresh data for',
        },
        ein: {
          type: 'string',
          description: 'EIN of the charity (alternative to holding_id)',
        },
      },
    },
  },
  {
    name: 'search_similar_charities',
    description: 'Find charities similar to a given holding based on sector, size, or mission',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to find similar charities for',
        },
        sector: {
          type: 'string',
          description: 'Sector to search within (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 5)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_charity_financials',
    description: 'Get detailed financial information for a charity from external sources',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding',
        },
        ein: {
          type: 'string',
          description: 'EIN of the charity (alternative to holding_id)',
        },
      },
    },
  },
  // ==================== TAX OPTIMIZATION MODULE ====================
  {
    name: 'run_tax_scenario',
    description: 'Compare different donation strategies (cash vs stock, timing, etc.) for tax optimization',
    input_schema: {
      type: 'object',
      properties: {
        scenario_type: {
          type: 'string',
          enum: ['cash_vs_stock', 'timing', 'bunching', 'daf_vs_direct'],
          description: 'Type of tax scenario to run',
        },
        donation_amount: {
          type: 'number',
          description: 'Total donation amount to analyze',
        },
        tax_year: {
          type: 'number',
          description: 'Tax year for the scenario (default: current year)',
        },
        assets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              current_value: { type: 'number' },
              cost_basis: { type: 'number' },
              holding_period: { type: 'string', enum: ['short', 'long'] },
            },
          },
          description: 'Assets available for donation (for cash_vs_stock)',
        },
      },
      required: ['scenario_type', 'donation_amount'],
    },
  },
  {
    name: 'calculate_deduction',
    description: 'Calculate the tax deduction for a charitable contribution',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Contribution amount',
        },
        asset_type: {
          type: 'string',
          enum: ['cash', 'public_stock', 'private_stock', 'real_estate', 'other'],
          description: 'Type of asset being donated',
        },
        recipient_type: {
          type: 'string',
          enum: ['public_charity', 'private_foundation', 'daf'],
          description: 'Type of recipient organization',
        },
        agi: {
          type: 'number',
          description: 'Adjusted Gross Income. Required for accurate calculation — if not provided, a placeholder value is used until tax year data is configured.',
        },
      },
      required: ['amount', 'asset_type', 'recipient_type'],
    },
  },
  {
    name: 'get_carryforward',
    description: 'Get carryforward amounts from prior year charitable contributions',
    input_schema: {
      type: 'object',
      properties: {
        tax_year: {
          type: 'number',
          description: 'Tax year to check carryforwards for (default: current year)',
        },
      },
    },
  },
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
          description: 'Holding ID (optional - if omitted, projects portfolio-wide)',
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
          description: 'Metrics to compare (optional - uses defaults if not specified)',
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
  // ==================== GRANT MANAGEMENT MODULE ====================
  {
    name: 'start_due_diligence',
    description: 'Start a due diligence workflow for a grantee. Creates checklist tasks for 501(c)(3) verification, financial review, mission alignment, and capacity evaluation.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding to start due diligence for' },
        template_id: { type: 'string', description: 'Optional: specific workflow template ID' },
        due_date: { type: 'string', description: 'Target completion date (ISO format)' },
        assigned_to: { type: 'string', description: 'Optional: user ID to assign tasks to' },
        priority_items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific checklist items to prioritize',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_workflow_status',
    description: 'Get the current status of workflows for a grant, including all tasks and their completion status.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        workflow_id: { type: 'string', description: 'Optional: specific workflow ID' },
        include_completed: { type: 'boolean', description: 'Include completed workflows (default: false)' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'complete_workflow_task',
    description: 'Mark a workflow task as completed with an outcome.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
        outcome: {
          type: 'string',
          enum: ['pass', 'fail', 'conditional', 'n/a'],
          description: 'Task outcome',
        },
        notes: { type: 'string', description: 'Notes about the completion' },
      },
      required: ['task_id', 'outcome'],
    },
  },
  {
    name: 'track_milestone',
    description: 'Update a grant milestone status or add a new milestone.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        milestone_id: { type: 'string', description: 'Optional: existing milestone to update' },
        name: { type: 'string', description: 'Milestone name (for new milestones)' },
        description: { type: 'string', description: 'Milestone description' },
        due_date: { type: 'string', description: 'Due date (ISO format)' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'cancelled'],
          description: 'Stored milestone workflow status. Overdue is computed from due_date and cannot be stored directly.',
        },
        notes: { type: 'string', description: 'Progress notes' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'schedule_reminder',
    description: 'Schedule a reminder for a grant-related deadline.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        holding_id: { type: 'string', description: 'Optional: related grant holding' },
        title: { type: 'string', description: 'Reminder title' },
        description: { type: 'string', description: 'Reminder details' },
        due_date: { type: 'string', description: 'Deadline date (ISO format)' },
        remind_days_before: {
          type: 'array',
          items: { type: 'number' },
          description: 'Days before due date to send reminders (e.g., [7, 3, 1])',
        },
        reminder_type: {
          type: 'string',
          enum: ['report_due', 'milestone_due', 'payment_due', 'renewal', 'follow_up', 'site_visit', 'custom'],
          description: 'Type of reminder',
        },
      },
      required: ['portfolio_id', 'title', 'due_date'],
    },
  },
  {
    name: 'get_upcoming_deadlines',
    description: 'Get all upcoming deadlines for grants in a portfolio including reports, milestones, payments, and workflow tasks.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        days_ahead: { type: 'number', description: 'Days to look ahead (default: 30)' },
        include_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by deadline types: reports, milestones, payments, renewals',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'log_grant_communication',
    description: 'Log a communication with a grantee.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        direction: { type: 'string', enum: ['inbound', 'outbound'], description: 'Communication direction' },
        comm_type: {
          type: 'string',
          enum: ['email', 'phone', 'meeting', 'site_visit', 'letter', 'portal_message', 'other'],
          description: 'Type of communication',
        },
        subject: { type: 'string', description: 'Subject/topic' },
        summary: { type: 'string', description: 'Summary of communication' },
        contact_name: { type: 'string', description: 'Contact person' },
        follow_up_required: { type: 'boolean', description: 'Needs follow-up?' },
        follow_up_date: { type: 'string', description: 'Follow-up date if required (ISO format)' },
      },
      required: ['holding_id', 'direction', 'comm_type', 'summary'],
    },
  },
  {
    name: 'get_grant_health',
    description: 'Get comprehensive health assessment for one or all grants in a portfolio including payment, milestone, report, and workflow status.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        holding_id: { type: 'string', description: 'Optional: specific grant holding' },
        include_details: { type: 'boolean', description: 'Include detailed breakdown (default: true)' },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'record_grant_payment',
    description: 'Record or update a grant payment/disbursement.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        payment_id: { type: 'string', description: 'Optional: existing payment to update' },
        amount: { type: 'number', description: 'Payment amount' },
        scheduled_date: { type: 'string', description: 'Scheduled payment date (ISO format)' },
        actual_date: { type: 'string', description: 'Actual payment date when completed (ISO format)' },
        status: {
          type: 'string',
          enum: ['scheduled', 'approved', 'processing', 'completed', 'cancelled'],
          description: 'Payment status',
        },
        payment_method: { type: 'string', enum: ['check', 'wire', 'ach'], description: 'Payment method' },
        notes: { type: 'string', description: 'Payment notes' },
      },
      required: ['holding_id'],
    },
  },
  // ==================== DONOR MANAGEMENT MODULE ====================
  {
    name: 'log_contribution_received',
    description: 'Log a donation received by the organization. Optionally auto-creates donor record if not found. Can automatically generate a receipt for contributions >= $250.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'Organization UUID receiving the donation' },
        amount: { type: 'number', description: 'Donation amount in USD' },
        contribution_date: { type: 'string', description: 'Date of contribution (YYYY-MM-DD, defaults to today)' },
        gift_type: {
          type: 'string',
          enum: ['cash', 'check', 'credit_card', 'securities', 'daf_grant', 'in_kind', 'pledge', 'bequest'],
          description: 'Type of gift stored on contributions_received.gift_type (default: cash)',
        },
        contribution_type: {
          type: 'string',
          enum: ['cash', 'check', 'credit_card', 'wire', 'ach', 'stock', 'crypto', 'real_estate', 'in_kind', 'other'],
          description: 'Legacy alias for gift_type. Prefer gift_type for new calls.',
        },
        donor_id: { type: 'string', description: 'Existing donor UUID (optional - provide donor info to auto-create)' },
        donor_name: { type: 'string', description: 'Donor name for auto-creation (e.g., "John Smith" or "Smith Foundation")' },
        donor_email: { type: 'string', description: 'Donor email for auto-creation' },
        donor_type: {
          type: 'string',
          enum: ['individual', 'foundation', 'corporation', 'government', 'other'],
          description: 'Type of donor (default: individual)',
        },
        designation: { type: 'string', description: 'Fund designation (e.g., "General Fund", "Building Campaign")' },
        is_restricted: { type: 'boolean', description: 'Whether the gift is restricted' },
        quid_pro_quo_value: { type: 'number', description: 'Value of goods/services provided in exchange (IRS requirement)' },
        campaign: { type: 'string', description: 'Campaign or appeal name' },
        notes: { type: 'string', description: 'Additional notes' },
        auto_generate_receipt: { type: 'boolean', description: 'Automatically generate receipt for contributions >= $250' },
      },
      required: ['organization_id', 'amount'],
    },
  },
  {
    name: 'generate_receipt',
    description: 'Generate an IRS-compliant tax receipt for a contribution. Required for donations >= $250.',
    input_schema: {
      type: 'object',
      properties: {
        contribution_id: { type: 'string', description: 'Contribution UUID to generate receipt for' },
        send_immediately: { type: 'boolean', description: 'Send receipt to donor immediately (default: false)' },
      },
      required: ['contribution_id'],
    },
  },
  {
    name: 'generate_acknowledgment',
    description: 'Create a thank-you letter or acknowledgment for a donor. Can be for a specific contribution or general.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'Organization UUID' },
        donor_id: { type: 'string', description: 'Donor UUID to acknowledge' },
        contribution_id: { type: 'string', description: 'Optional: specific contribution to acknowledge' },
        letter_type: {
          type: 'string',
          enum: ['thank_you', 'annual_summary', 'welcome', 'custom'],
          description: 'Type of acknowledgment letter (default: thank_you)',
        },
        custom_message: { type: 'string', description: 'Custom message to include in the letter' },
        send_via: {
          type: 'string',
          enum: ['email', 'mail', 'both'],
          description: 'How to send the acknowledgment (default: email)',
        },
      },
      required: ['organization_id', 'donor_id'],
    },
  },
  {
    name: 'get_donor_summary',
    description: 'Get a comprehensive donor profile including giving history, communications, and status.',
    input_schema: {
      type: 'object',
      properties: {
        donor_id: { type: 'string', description: 'Donor UUID' },
        include_contributions: { type: 'boolean', description: 'Include detailed contribution history (default: true)' },
        include_communications: { type: 'boolean', description: 'Include communication log (default: true)' },
        year: { type: 'number', description: 'Filter contributions to specific year' },
      },
      required: ['donor_id'],
    },
  },
  {
    name: 'search_donors',
    description: 'Search and filter donors by various criteria.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'Organization UUID' },
        name: { type: 'string', description: 'Search by donor name (partial match)' },
        email: { type: 'string', description: 'Search by email' },
        donor_type: {
          type: 'string',
          enum: ['individual', 'foundation', 'corporation', 'government', 'other'],
          description: 'Filter by donor type',
        },
        donor_tier: {
          type: 'string',
          enum: ['major', 'mid', 'recurring', 'annual', 'lapsed', 'prospect'],
          description: 'Filter by giving tier',
        },
        recency_status: {
          type: 'string',
          enum: ['active', 'lapsed', 'lost'],
          description: 'Filter by recency status',
        },
        min_lifetime_giving: { type: 'number', description: 'Minimum lifetime giving amount' },
        has_pending_receipts: { type: 'boolean', description: 'Filter to donors with pending receipts' },
        has_pending_acknowledgments: { type: 'boolean', description: 'Filter to donors needing acknowledgment' },
        limit: { type: 'number', description: 'Maximum results to return (default: 50)' },
      },
      required: ['organization_id'],
    },
  },

  // ==================== COMPLIANCE & REGULATORY MODULE ====================
  {
    name: 'get_compliance_status',
    description: 'Get overall compliance health summary for an organization: filing overdue counts, self-dealing incidents, state renewal status, payout status, and health score (0-100). Use this to answer "How are we doing on compliance?" or "What compliance issues do we have?"',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'UUID of the organization' },
        portfolio_id: { type: 'string', description: 'UUID of the portfolio (for payout status)' },
        tax_year: { type: 'number', description: 'Tax year for payout status (default: current year)' },
      },
      required: ['organization_id'],
    },
  },
  {
    name: 'calculate_payout_requirement',
    description: 'Calculate the IRC §4942 minimum distribution requirement (5% of average net investment assets) for a private foundation. Shows full calculation: net value of non-charitable assets × 5% = MIR, minus excise tax = distributable amount. Use when asked about payout requirements or how much must be distributed.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: { type: 'number', description: 'Tax year (default: current year)' },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'get_payout_forecast',
    description: 'Forecast how much more a foundation must grant by year-end to meet §4942 requirements. Shows distributions already made, pending pipeline grants, and remaining shortfall. Use when asked "How much more do we need to grant?" or "Are we on track for our payout requirement?"',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: { type: 'number', description: 'Tax year (default: current year)' },
        include_pending: { type: 'boolean', description: 'Whether to include approved/scheduled grant payments in the pipeline (default: true)' },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'screen_for_self_dealing',
    description: 'Pre-screen a proposed transaction against the §4946 disqualified persons registry. Provide the counterparty name and/or EIN. Returns risk level (none/medium/high) and matching disqualified persons. Can optionally create a self_dealing_incidents record flagged for review.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'UUID of the organization' },
        counterparty_name: { type: 'string', description: 'Name of the other party in the transaction' },
        counterparty_ein: { type: 'string', description: 'EIN of the other party (optional)' },
        transaction_type: {
          type: 'string',
          enum: ['sale_or_exchange', 'loan_or_extension_of_credit', 'furnishing_goods_services', 'payment_of_compensation', 'transfer_or_use_of_assets', 'agreement_to_pay_money', 'indirect_self_dealing'],
          description: 'Type of transaction to screen',
        },
        amount: { type: 'number', description: 'Dollar amount of the transaction (optional)' },
        create_incident_if_flagged: { type: 'boolean', description: 'If true and a match is found, create a self_dealing_incidents record (default: false)' },
        incident_date: { type: 'string', description: 'Date of the proposed transaction (YYYY-MM-DD, default: today)' },
        description: { type: 'string', description: 'Description of the transaction' },
      },
      required: ['organization_id', 'counterparty_name'],
    },
  },
  {
    name: 'register_disqualified_person',
    description: 'Add a person or entity to the §4946 disqualified persons registry. Required for foundation managers, substantial contributors (≥$5,000 and ≥2% of total contributions), 20%+ owners, family members of the above, and 35%+ owned entities.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'UUID of the organization' },
        full_name: { type: 'string', description: 'Full legal name of the person or entity' },
        relationship_type: {
          type: 'string',
          enum: ['founder', 'substantial_contributor', 'foundation_manager', 'twenty_pct_owner', 'family_member', 'thirty_five_pct_owned_entity', 'government_official'],
          description: 'Their relationship to the foundation under IRC §4946',
        },
        title_or_role: { type: 'string', description: 'Job title or role (e.g., "Executive Director", "Trustee")' },
        ein: { type: 'string', description: 'EIN for entities' },
        ssn_last4: { type: 'string', description: 'Last 4 digits of SSN for individuals (privacy: never store full SSN)' },
        start_date: { type: 'string', description: 'Date they became a disqualified person (YYYY-MM-DD, default: today)' },
        related_to_person_id: { type: 'string', description: 'UUID of the disqualified person they are a family member of (for family members)' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['organization_id', 'full_name', 'relationship_type'],
    },
  },
  {
    name: 'track_filing_deadline',
    description: 'Add or update a filing deadline in the compliance calendar. Use for 990-PF, 990, 990-T, Form 4720, Form 8868, state annual reports, and state registrations. Can also mark a filing as filed or extended.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'UUID of the organization' },
        filing_id: { type: 'string', description: 'UUID of existing filing to update (omit to create new)' },
        filing_type: {
          type: 'string',
          enum: ['990_pf', '990', '990_ez', '990_n', '990_t', 'state_annual_report', 'state_registration', 'state_renewal', 'state_990_copy', 'form_4720', 'form_5227', 'form_8868', 'other'],
          description: 'Type of filing',
        },
        tax_year: { type: 'number', description: 'Tax year this filing covers' },
        jurisdiction: { type: 'string', description: 'State code (e.g., "CA") or "federal" (default: federal)' },
        due_date: { type: 'string', description: 'Original due date (YYYY-MM-DD)' },
        extended_due_date: { type: 'string', description: 'Extended due date if extension filed (YYYY-MM-DD)' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'filed', 'filed_late', 'extended', 'overdue', 'not_required'],
          description: 'Current status',
        },
        filed_date: { type: 'string', description: 'Date actually filed (YYYY-MM-DD)' },
        confirmation_number: { type: 'string', description: 'IRS or state confirmation number' },
        description: { type: 'string', description: 'Description of the filing' },
      },
      required: ['organization_id'],
    },
  },
  {
    name: 'log_expenditure_responsibility',
    description: 'Create or update an §4945 expenditure responsibility tracking record for a grant to a non-public-charity grantee. Tracks the ER agreement, required progress reports, and terminal report.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        grant_id: { type: 'string', description: 'UUID of the grants record' },
        er_record_id: { type: 'string', description: 'UUID of existing ER record to update (omit to create)' },
        grantee_is_public_charity: { type: 'boolean', description: 'Is the grantee a public charity? (if true, ER agreement not required)' },
        grantee_ein: { type: 'string', description: "Grantee's EIN" },
        grantee_501c3_verified: { type: 'boolean', description: '501(c)(3) status verified' },
        er_agreement_signed_date: { type: 'string', description: 'Date ER agreement was signed (YYYY-MM-DD)' },
        er_reports_required_count: { type: 'number', description: 'Total number of progress reports required' },
        er_reports_received_count: { type: 'number', description: 'Number of progress reports received so far' },
        terminal_report_received: { type: 'boolean', description: 'Whether the terminal report has been received' },
        terminal_report_date: { type: 'string', description: 'Date terminal report received (YYYY-MM-DD)' },
        er_status: {
          type: 'string',
          enum: ['pending', 'compliant', 'deficient', 'waived'],
          description: 'Overall ER compliance status',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'assess_qualifying_distribution',
    description: 'Record a qualifying distribution for §4942 payout tracking. Classifies the payment (grants, program expenses, admin expenses, set-asides) and records the qualifying amount.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: { type: 'number', description: 'Tax year this distribution applies to' },
        category: {
          type: 'string',
          enum: ['grants_paid', 'grants_paid_er', 'program_expenses', 'admin_expenses', 'set_aside', 'program_related_investment', 'operating_foundation_expenditure'],
          description: 'Distribution category for 990-PF Part XII',
        },
        description: { type: 'string', description: 'Description of the distribution' },
        gross_amount: { type: 'number', description: 'Total gross amount paid' },
        qualifying_amount: { type: 'number', description: 'Amount that qualifies for §4942 purposes (may differ from gross for admin expenses)' },
        distribution_date: { type: 'string', description: 'Date of distribution (YYYY-MM-DD)' },
        grant_payment_id: { type: 'string', description: 'UUID of grant_payments record (optional, links distribution to payment)' },
        holding_id: { type: 'string', description: 'UUID of holding (optional)' },
        approved_by_board: { type: 'boolean', description: 'Whether board approved this distribution (required for set-asides)' },
        board_approval_date: { type: 'string', description: 'Date of board approval (YYYY-MM-DD)' },
      },
      required: ['portfolio_id', 'tax_year', 'category', 'description', 'gross_amount', 'qualifying_amount', 'distribution_date'],
    },
  },
  {
    name: 'get_990pf_export_data',
    description: 'Get structured 990-PF data organized by Part for a given tax year. Returns Part I (revenue/expenses), Part II (balance sheet), Part XI (distributable amount), and Part XII (qualifying distributions) with line-item detail. Use when asked to prepare 990-PF data or export tax information.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: { type: 'number', description: 'Tax year (default: current year)' },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'get_state_registration_status',
    description: 'Get state charitable registration status for an organization. Returns registration details for all states or a specific state, including expiration dates and annual report requirements.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'UUID of the organization' },
        state_code: { type: 'string', description: 'Two-letter state code to filter to a specific state (optional)' },
        status_filter: {
          type: 'string',
          enum: ['registered', 'renewal_pending', 'renewal_overdue', 'exempt', 'not_registered', 'lapsed', 'rejected'],
          description: 'Filter by registration status (optional)',
        },
      },
      required: ['organization_id'],
    },
  },
];
