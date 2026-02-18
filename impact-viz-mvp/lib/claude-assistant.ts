// @ts-nocheck - Supabase generated types are incorrect for this file
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from './ai-action-executor';
import {
  ModuleId,
  filterToolsForOrg,
  getOrgEnabledModules,
  getSystemPromptForModules,
} from './modules';

// AI Action types (same as ai-assistant.ts)
export type AIAction = {
  id: string;
  sessionId: string;
  portfolioId: string;
  userId: string;
  actionType: 'create' | 'update' | 'delete';
  entityType: 'holding' | 'metric_fact' | 'widget' | 'location' | 'contribution' | 'kpi_definition';
  entityId?: string;
  operationData: {
    table: string;
    before?: any;
    after?: any;
  };
  aiReasoning?: string;
  userPrompt?: string;
  status: 'applied' | 'undone' | 'redone';
  batchId?: string;
  sequenceOrder?: number;
};

// Tool execution result types
type ToolResult = {
  action: AIAction | null;
  additionalActions?: AIAction[];
  output: any;
};

// Input validation helpers
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const InputValidator = {
  validateUUID(value: string, fieldName: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid UUID`);
    }
  },

  validateNumber(value: any, fieldName: string, options?: { min?: number; max?: number }): void {
    if (value === undefined || value === null) return;
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName} must be a valid number`);
    }
    if (options?.min !== undefined && num < options.min) {
      throw new ValidationError(`${fieldName} must be at least ${options.min}`);
    }
    if (options?.max !== undefined && num > options.max) {
      throw new ValidationError(`${fieldName} must be at most ${options.max}`);
    }
  },

  validateString(value: any, fieldName: string, options?: { maxLength?: number; pattern?: RegExp }): void {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    if (options?.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must be at most ${options.maxLength} characters`);
    }
    if (options?.pattern && !options.pattern.test(value)) {
      throw new ValidationError(`${fieldName} has invalid format`);
    }
  },

  validateEnum<T>(value: any, fieldName: string, allowedValues: readonly T[]): void {
    if (value === undefined || value === null) return;
    if (!allowedValues.includes(value as T)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
  },

  validateDateString(value: any, fieldName: string): void {
    if (value === undefined || value === null) return;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date string (YYYY-MM-DD)`);
    }
  },

  validateArray(value: any, fieldName: string, options?: { maxLength?: number }): void {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`);
    }
    if (options?.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must contain at most ${options.maxLength} items`);
    }
  },
};

// Time window helper
type TimeWindow = '3m' | '6m' | '12m' | '24m' | 'all';
const TimeWindowHelper = {
  getStartDate(window: TimeWindow): string {
    const windowDays: Record<TimeWindow, number> = {
      '3m': 90,
      '6m': 180,
      '12m': 365,
      '24m': 730,
      'all': 3650,
    };
    const days = windowDays[window] || 365;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  },
};

// Color palette constants
const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

// Tool definitions for Claude function calling (Anthropic format)
// Exported for use by module filtering system
export const PORTFOLIO_TOOLS: Anthropic.Tool[] = [
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
          description: 'Adjusted Gross Income (optional - uses tax profile if not provided)',
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
];

/**
 * Claude-powered AI Assistant for portfolio management
 * Uses Anthropic's Claude Sonnet model for conversation and function calling
 *
 * Supports modular tool filtering - only tools from enabled modules are available.
 * When orgId is provided, tools are filtered based on the organization's enabled modules.
 */
export class ClaudePortfolioAssistant {
  private anthropic: Anthropic;
  private supabase: ReturnType<typeof createClient>;
  private enabledModules: ModuleId[] = ['core'];
  private moduleSystemPrompt: string = '';

  constructor(supabaseServiceRole: string, anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceRole,
      { auth: { persistSession: false } }
    );
  }

  /**
   * Initialize assistant with organization context for module filtering
   * Call this before chat() when you want module-based tool filtering
   */
  async initializeForOrg(orgId: string): Promise<void> {
    this.enabledModules = await getOrgEnabledModules(this.supabase, orgId);
    this.moduleSystemPrompt = getSystemPromptForModules(this.enabledModules);
  }

  /**
   * Get tools filtered by enabled modules
   */
  private getFilteredTools(): Anthropic.Tool[] {
    return filterToolsForOrg(PORTFOLIO_TOOLS, this.enabledModules);
  }

  /**
   * Reset to default (all tools) - useful for admin or portfolio-only context
   */
  resetToDefault(): void {
    this.enabledModules = ['core'];
    this.moduleSystemPrompt = '';
  }

  /**
   * Process a user message and generate AI response with actions
   *
   * @param params.orgId - Optional organization ID for module-based tool filtering
   *                       If provided, tools will be filtered based on enabled modules
   */
  async chat(params: {
    portfolioId: string;
    userId: string;
    sessionId: string;
    message: string;
    orgId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const { portfolioId, userId, sessionId, message, orgId, conversationHistory = [] } = params;

    // Initialize for organization if provided (enables module filtering)
    if (orgId) {
      await this.initializeForOrg(orgId);
    }

    // Get filtered tools based on enabled modules
    const tools = this.getFilteredTools();

    // Get portfolio context
    const context = await this.getPortfolioContext(portfolioId);

    // Build system prompt with module-specific additions
    const systemPrompt = this.buildSystemPrompt(context);

    // Convert conversation history to Claude format
    const claudeMessages: Anthropic.MessageParam[] = [
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // Call Claude with function calling (using filtered tools)
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: claudeMessages,
    });

    // Process the response
    const actions: AIAction[] = [];
    const toolResults: Array<{ tool_use_id: string; content: string }> = [];
    let textContent = '';

    // Check for tool use in the response
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    // Collect any text from the initial response
    textContent = textBlocks.map(b => b.text).join('');

    if (toolUseBlocks.length > 0) {
      const batchId = crypto.randomUUID();

      // Execute each tool call
      for (let i = 0; i < toolUseBlocks.length; i++) {
        const toolUse = toolUseBlocks[i];
        const functionName = toolUse.name;
        const functionArgs = toolUse.input as Record<string, any>;

        try {
          const result = await this.executeTool(
            functionName,
            functionArgs,
            portfolioId,
            userId,
            sessionId,
            batchId,
            i,
            message
          );

          if (result.action) {
            actions.push(result.action);
          }
          if (result.additionalActions) {
            actions.push(...result.additionalActions);
          }
          toolResults.push({
            tool_use_id: toolUse.id,
            content: JSON.stringify(result.output),
          });
        } catch (error) {
          toolResults.push({
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (error as Error).message }),
          });
        }
      }

      // Get final response with tool results (using same filtered tools)
      const finalResponse = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: [
          ...claudeMessages,
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: toolResults.map(tr => ({
              type: 'tool_result' as const,
              tool_use_id: tr.tool_use_id,
              content: tr.content,
            })),
          },
        ],
      });

      // Extract text from final response
      const finalTextBlocks = finalResponse.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      textContent = finalTextBlocks.map(b => b.text).join('');

      return {
        message: textContent,
        actions,
        toolCalls: toolUseBlocks.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input) },
        })),
        toolResults,
      };
    }

    return {
      message: textContent,
      actions: [],
      toolCalls: [],
      toolResults: [],
    };
  }

  /**
   * Verify user has access to portfolio
   */
  private async verifyPortfolioAccess(portfolioId: string, userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error('Access denied: You do not have permission to access this portfolio');
    }
  }

  /**
   * Execute a tool/function call
   */
  private async executeTool(
    functionName: string,
    args: any,
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string
  ): Promise<ToolResult> {
    // Verify user has access to this portfolio
    await this.verifyPortfolioAccess(portfolioId, userId);

    const executor = new AIActionExecutor(this.supabase);

    switch (functionName) {
      case 'add_holding':
        return await executor.createHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'update_holding':
        return await executor.updateHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'remove_holding':
        return await executor.deleteHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'add_metric_fact':
        return await executor.addMetricFact(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'create_widget':
        return await executor.createWidget(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'add_location':
        return await executor.addLocation(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'list_holdings': {
        const { data } = await this.supabase
          .from('holdings')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .eq('status', args.status || 'Active');

        return {
          action: null,
          output: { holdings: data || [] },
        };
      }

      case 'search_holdings': {
        InputValidator.validateString(args.sector, 'sector', { maxLength: 200 });
        InputValidator.validateString(args.country, 'country', { maxLength: 100 });
        InputValidator.validateEnum(args.status, 'status', ['Active', 'Exited', 'Pipeline'] as const);
        InputValidator.validateNumber(args.min_allocation, 'min_allocation', { min: 0, max: 1e12 });
        InputValidator.validateNumber(args.max_allocation, 'max_allocation', { min: 0, max: 1e12 });
        InputValidator.validateString(args.name_contains, 'name_contains', { maxLength: 200 });

        if (args.min_allocation !== undefined && args.max_allocation !== undefined && args.min_allocation > args.max_allocation) {
          throw new ValidationError('min_allocation cannot be greater than max_allocation');
        }

        let query = this.supabase
          .from('holdings')
          .select('id, name, sector, country, status, funds_allocated, description')
          .eq('portfolio_id', portfolioId);

        if (args.sector) query = query.ilike('sector', `%${args.sector}%`);
        if (args.country) query = query.ilike('country', `%${args.country}%`);
        if (args.status) query = query.eq('status', args.status);
        if (args.min_allocation) query = query.gte('funds_allocated', args.min_allocation);
        if (args.max_allocation) query = query.lte('funds_allocated', args.max_allocation);
        if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);

        const { data } = await query.order('funds_allocated', { ascending: false });

        return {
          action: null,
          output: {
            holdings: data || [],
            count: data?.length || 0,
            filters_applied: Object.keys(args).filter(k => args[k] !== undefined),
          },
        };
      }

      case 'get_metric_trend': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        if (!args.metric_code) {
          throw new ValidationError('metric_code is required');
        }
        if (args.holding_id) {
          InputValidator.validateUUID(args.holding_id, 'holding_id');
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);

        const window: TimeWindow = (args.window as TimeWindow) || 'all';
        const startDate = TimeWindowHelper.getStartDate(window);

        let query = this.supabase
          .from('metric_facts')
          .select('value, unit, period_start, period_end, holdings!inner(id, name, portfolio_id)')
          .eq('metric_code', args.metric_code)
          .eq('holdings.portfolio_id', portfolioId)
          .gte('period_end', startDate)
          .order('period_end', { ascending: true });

        if (args.holding_id) {
          query = query.eq('holding_id', args.holding_id);
        }

        const { data } = await query;

        const byPeriod: Record<string, { total: number; count: number }> = {};
        (data || []).forEach((fact: any) => {
          const period = fact.period_end || fact.period_start;
          if (!byPeriod[period]) {
            byPeriod[period] = { total: 0, count: 0 };
          }
          byPeriod[period].total += fact.value || 0;
          byPeriod[period].count++;
        });

        const trend = Object.entries(byPeriod)
          .map(([date, { total }]) => ({ date, value: total }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (trend.length === 0) {
          const { data: availableMetrics } = await this.supabase
            .from('metric_facts')
            .select('metric_code, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

          return {
            action: null,
            output: {
              metric_code: args.metric_code,
              window,
              trend: [],
              data_points: 0,
              no_data: true,
              message: `No data found for metric '${args.metric_code}' in this portfolio.`,
              available_metrics: uniqueMetrics,
              suggestion: uniqueMetrics.length > 0
                ? `Try one of these metrics instead: ${uniqueMetrics.slice(0, 10).join(', ')}`
                : 'No metric data exists in this portfolio yet. Upload reports or add metrics to holdings first.',
            },
          };
        }

        return {
          action: null,
          output: {
            metric_code: args.metric_code,
            window,
            trend,
            data_points: trend.length,
            unit: data?.[0]?.unit || null,
          },
        };
      }

      case 'compare_holdings': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        if (!args.metric_code) {
          throw new ValidationError('metric_code is required');
        }
        InputValidator.validateArray(args.holding_ids, 'holding_ids', { maxLength: 100 });
        if (args.holding_ids) {
          args.holding_ids.forEach((id: string, idx: number) => {
            InputValidator.validateUUID(id, `holding_ids[${idx}]`);
          });
        }
        InputValidator.validateEnum(args.sort_order, 'sort_order', ['asc', 'desc'] as const);
        InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

        const { data: holdings } = await this.supabase
          .from('holdings')
          .select('id, name, sector')
          .eq('portfolio_id', portfolioId);

        const holdingIds = args.holding_ids || holdings?.map((h: any) => h.id) || [];
        const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h]));

        const { data: facts } = await this.supabase
          .from('metric_facts')
          .select('holding_id, value, unit, period_end')
          .eq('metric_code', args.metric_code)
          .in('holding_id', holdingIds)
          .order('period_end', { ascending: false });

        const latestByHolding: Record<string, { value: number; unit: string | null; date: string }> = {};
        (facts || []).forEach((fact: any) => {
          if (!latestByHolding[fact.holding_id]) {
            latestByHolding[fact.holding_id] = {
              value: fact.value,
              unit: fact.unit,
              date: fact.period_end,
            };
          }
        });

        const comparison = Object.entries(latestByHolding)
          .map(([holdingId, data]) => ({
            holding_id: holdingId,
            holding_name: holdingMap.get(holdingId)?.name || 'Unknown',
            sector: holdingMap.get(holdingId)?.sector || null,
            value: data.value,
            unit: data.unit,
            date: data.date,
          }))
          .sort((a, b) => args.sort_order === 'asc' ? a.value - b.value : b.value - a.value)
          .slice(0, args.limit || 10);

        if (comparison.length === 0) {
          const { data: availableMetrics } = await this.supabase
            .from('metric_facts')
            .select('metric_code, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

          return {
            action: null,
            output: {
              metric_code: args.metric_code,
              comparison: [],
              holdings_with_data: 0,
              no_data: true,
              message: `No data found for metric '${args.metric_code}' in this portfolio.`,
              available_metrics: uniqueMetrics,
              suggestion: uniqueMetrics.length > 0
                ? `Try one of these metrics instead: ${uniqueMetrics.slice(0, 10).join(', ')}`
                : 'No metric data exists in this portfolio yet. Upload reports or add metrics to holdings first.',
            },
          };
        }

        return {
          action: null,
          output: {
            metric_code: args.metric_code,
            comparison,
            holdings_with_data: comparison.length,
          },
        };
      }

      case 'get_portfolio_summary': {
        const includeKpis = args.include_kpis !== false;
        const includeSectors = args.include_sectors !== false;
        const includeTopHoldings = args.include_top_holdings !== false;

        const { data: holdings } = await this.supabase
          .from('holdings')
          .select('id, name, sector, status, funds_allocated')
          .eq('portfolio_id', portfolioId)
          .order('funds_allocated', { ascending: false });

        const holdingsData = holdings || [];
        const totalAUM = holdingsData.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
        const totalNAV = holdingsData.reduce((sum: number, h: any) => sum + (h.nav || 0), 0);

        const summary: any = {
          total_holdings: holdingsData.length,
          active_holdings: holdingsData.filter(h => h.status === 'Active').length,
          total_aum: totalAUM,
          total_nav: totalNAV,
        };

        if (includeSectors) {
          const sectors: Record<string, { count: number; funds: number }> = {};
          holdingsData.forEach((h: any) => {
            const sector: string = h.sector || 'Unspecified';
            if (!sectors[sector]) sectors[sector] = { count: 0, funds: 0 };
            sectors[sector].count++;
            sectors[sector].funds += h.funds_allocated || 0;
          });
          summary.sector_breakdown = sectors;
        }

        if (includeTopHoldings) {
          summary.top_holdings = holdingsData.slice(0, 5).map(h => ({
            name: h.name,
            funds_allocated: h.funds_allocated,
            sector: h.sector,
          }));
        }

        if (includeKpis) {
          const { data: kpis } = await this.supabase
            .from('portfolio_metric_targets')
            .select('metric_code, target_value, display_name')
            .eq('portfolio_id', portfolioId);

          const { data: facts } = await this.supabase
            .from('metric_facts')
            .select('metric_code, value, unit, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          const totals: Record<string, { value: number; unit: string | null }> = {};
          (facts || []).forEach((fact: any) => {
            if (!totals[fact.metric_code]) {
              totals[fact.metric_code] = { value: 0, unit: fact.unit };
            }
            totals[fact.metric_code].value += fact.value || 0;
          });

          summary.kpi_performance = (kpis || []).map((kpi: any) => {
            const current = totals[kpi.metric_code]?.value || 0;
            const target = kpi.target_value;
            return {
              metric: kpi.display_name || kpi.metric_code,
              current,
              target,
              percent_complete: target ? Math.round((current / target) * 100) : null,
              unit: totals[kpi.metric_code]?.unit || null,
            };
          });
        }

        return {
          action: null,
          output: summary,
        };
      }

      case 'get_holding_details': {
        const { data } = await this.supabase
          .from('holdings')
          .select('*, metric_facts(*), holding_widgets(*), charities(*)')
          .eq('id', args.holding_id)
          .single();

        return {
          action: null,
          output: { holding: data },
        };
      }

      case 'list_widgets': {
        const limit = args.limit || 50;
        const { data } = await this.supabase
          .from('widgets')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .order('position', { ascending: true })
          .limit(limit);

        return {
          action: null,
          output: { widgets: data || [], count: data?.length || 0 },
        };
      }

      case 'display_widget': {
        const { data: portfolioWidget } = await this.supabase
          .from('widgets')
          .select('*')
          .eq('id', args.widget_id)
          .maybeSingle();

        const { data: holdingWidget } = await this.supabase
          .from('holding_widgets')
          .select('*')
          .eq('id', args.widget_id)
          .maybeSingle();

        const widget = portfolioWidget || holdingWidget;

        if (!widget) {
          throw new Error(`Widget with ID ${args.widget_id} not found`);
        }

        const { data: action } = await this.supabase
          .from('ai_actions')
          .insert({
            session_id: sessionId,
            portfolio_id: portfolioId,
            user_id: userId,
            action_type: 'create',
            entity_type: 'widget',
            entity_id: widget.id,
            operation_data: {
              table: portfolioWidget ? 'widgets' : 'holding_widgets',
              after: widget,
              display_only: true,
            },
            ai_reasoning: `Displaying existing widget: "${widget.title}"`,
            user_prompt: userPrompt,
            status: 'applied',
            batch_id: batchId,
            sequence_order: sequenceOrder,
          })
          .select()
          .single();

        return {
          action: action as AIAction,
          output: { widget, displayed: true },
        };
      }

      case 'create_portfolio_widget': {
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
            table: 'widgets',
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

      case 'get_chart_data': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        const validDataTypes = ['holdings_by_sector', 'holdings_by_country', 'metric_trend', 'metric_comparison', 'allocation_breakdown', 'status_breakdown'] as const;
        InputValidator.validateEnum(args.data_type, 'data_type', validDataTypes);
        if (!args.data_type) {
          throw new ValidationError('data_type is required');
        }
        if (args.metric_code) {
          InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        }
        if (['metric_trend', 'metric_comparison'].includes(args.data_type) && !args.metric_code) {
          throw new ValidationError(`metric_code is required for data_type '${args.data_type}'`);
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);
        InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

        const limit = args.limit || 10;
        const window = args.window || 'all';

        const createChartPreview = (title: string, chartType: string, data: any[], xField: string, yField: string, colors: string[]) => {
          const isPieOrDonut = chartType === 'pie' || chartType === 'donut';
          const d3Config = {
            d3: {
              kind: chartType,
              data,
              encoding: {
                x: xField,
                y: yField,
                ...(isPieOrDonut && { label: xField, value: yField }),
              },
              options: {
                colors,
              },
            },
          };

          const widgetPreview = {
            id: crypto.randomUUID(),
            portfolio_id: portfolioId,
            type: 'd3_json',
            title,
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
              table: 'widgets',
              after: widgetPreview,
              is_preview: true,
            },
            ai_reasoning: `Created ${chartType} chart: "${title}"`,
            user_prompt: userPrompt,
            status: 'preview',
            batch_id: batchId,
            sequence_order: sequenceOrder,
          };

          return { previewAction, widgetPreview };
        };

        switch (args.data_type) {
          case 'holdings_by_sector': {
            const { data: holdings } = await this.supabase
              .from('holdings')
              .select('sector, funds_allocated')
              .eq('portfolio_id', portfolioId);

            const sectors: Record<string, number> = {};
            (holdings || []).forEach((h: any) => {
              const sector = h.sector || 'Unspecified';
              sectors[sector] = (sectors[sector] || 0) + (h.funds_allocated || 0);
            });

            const chartData = Object.entries(sectors)
              .map(([sector, funds]) => ({ sector, funds }))
              .sort((a, b) => b.funds - a.funds)
              .slice(0, limit);

            const sectorChartType = chartData.length <= 6 ? 'pie' : 'bar';
            const { previewAction: sectorAction, widgetPreview: sectorWidget } = createChartPreview(
              'Holdings by Sector',
              sectorChartType,
              chartData,
              'sector',
              'funds',
              CHART_COLORS
            );

            return {
              action: sectorAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: sectorWidget,
                message: `Generated a ${sectorChartType} chart showing holdings by sector.`,
              },
            };
          }

          case 'holdings_by_country': {
            const { data: holdings } = await this.supabase
              .from('holdings')
              .select('country, funds_allocated')
              .eq('portfolio_id', portfolioId);

            const countries: Record<string, number> = {};
            (holdings || []).forEach((h: any) => {
              const country = h.country || 'Unspecified';
              countries[country] = (countries[country] || 0) + (h.funds_allocated || 0);
            });

            const chartData = Object.entries(countries)
              .map(([country, funds]) => ({ country, funds }))
              .sort((a, b) => b.funds - a.funds)
              .slice(0, limit);

            const countryChartType = chartData.length <= 6 ? 'pie' : 'bar';
            const { previewAction: countryAction, widgetPreview: countryWidget } = createChartPreview(
              'Holdings by Country',
              countryChartType,
              chartData,
              'country',
              'funds',
              CHART_COLORS
            );

            return {
              action: countryAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: countryWidget,
                message: `Generated a ${countryChartType} chart showing holdings by country.`,
              },
            };
          }

          case 'metric_trend': {
            if (!args.metric_code) {
              throw new Error('metric_code is required for metric_trend');
            }

            const effectiveWindow = (args.window as TimeWindow) || 'all';
            const startDate = TimeWindowHelper.getStartDate(effectiveWindow);

            const { data: facts } = await this.supabase
              .from('metric_facts')
              .select('value, period_end, holdings!inner(portfolio_id)')
              .eq('metric_code', args.metric_code)
              .eq('holdings.portfolio_id', portfolioId)
              .gte('period_end', startDate)
              .order('period_end', { ascending: true });

            const byPeriod: Record<string, number> = {};
            (facts || []).forEach((fact: any) => {
              const period = fact.period_end;
              byPeriod[period] = (byPeriod[period] || 0) + (fact.value || 0);
            });

            const chartData = Object.entries(byPeriod)
              .map(([date, value]) => ({ date, value }))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            if (chartData.length === 0) {
              const { data: availableMetrics } = await this.supabase
                .from('metric_facts')
                .select('metric_code, holdings!inner(portfolio_id)')
                .eq('holdings.portfolio_id', portfolioId);

              const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

              return {
                action: null,
                output: {
                  data: [],
                  no_data: true,
                  message: `No data found for metric '${args.metric_code}' in this portfolio.`,
                  available_metrics: uniqueMetrics,
                  suggestion: uniqueMetrics.length > 0
                    ? `Try one of these metrics instead: ${uniqueMetrics.slice(0, 10).join(', ')}`
                    : 'No metric data exists in this portfolio yet. Upload reports or add metrics to holdings first.',
                },
              };
            }

            const chartTitle = `${args.metric_code} Trend`;
            const d3Config = {
              d3: {
                kind: 'line',
                data: chartData,
                encoding: {
                  x: 'date',
                  y: 'value',
                },
                options: {
                  xType: 'time',
                  colors: [CHART_COLORS[0]],
                },
              },
            };

            const widgetPreview = {
              id: crypto.randomUUID(),
              portfolio_id: portfolioId,
              type: 'd3_json',
              title: chartTitle,
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
                table: 'widgets',
                after: widgetPreview,
                is_preview: true,
              },
              ai_reasoning: `Created trend chart for ${args.metric_code}`,
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder,
            };

            return {
              action: previewAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: widgetPreview,
                message: `Generated a line chart showing ${args.metric_code} trend with ${chartData.length} data points.`,
              },
            };
          }

          case 'metric_comparison': {
            if (!args.metric_code) {
              throw new Error('metric_code is required for metric_comparison');
            }

            const { data: holdings } = await this.supabase
              .from('holdings')
              .select('id, name')
              .eq('portfolio_id', portfolioId);

            const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h.name]));

            const { data: facts } = await this.supabase
              .from('metric_facts')
              .select('holding_id, value, period_end')
              .eq('metric_code', args.metric_code)
              .in('holding_id', Array.from(holdingMap.keys()))
              .order('period_end', { ascending: false });

            const latestByHolding: Record<string, number> = {};
            (facts || []).forEach((fact: any) => {
              if (!latestByHolding[fact.holding_id]) {
                latestByHolding[fact.holding_id] = fact.value;
              }
            });

            const chartData = Object.entries(latestByHolding)
              .map(([holdingId, value]) => ({
                holding: holdingMap.get(holdingId) || 'Unknown',
                value,
              }))
              .sort((a, b) => b.value - a.value)
              .slice(0, limit);

            if (chartData.length === 0) {
              const { data: availableMetrics } = await this.supabase
                .from('metric_facts')
                .select('metric_code, holdings!inner(portfolio_id)')
                .eq('holdings.portfolio_id', portfolioId);

              const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

              return {
                action: null,
                output: {
                  data: [],
                  no_data: true,
                  message: `No data found for metric '${args.metric_code}' in this portfolio.`,
                  available_metrics: uniqueMetrics,
                  suggestion: uniqueMetrics.length > 0
                    ? `Try one of these metrics instead: ${uniqueMetrics.slice(0, 10).join(', ')}`
                    : 'No metric data exists in this portfolio yet. Upload reports or add metrics to holdings first.',
                },
              };
            }

            const comparisonTitle = `${args.metric_code} by Holding`;
            const comparisonD3Config = {
              d3: {
                kind: 'bar',
                data: chartData,
                encoding: {
                  x: 'holding',
                  y: 'value',
                },
                options: {
                  colors: ['#10b981'],
                },
              },
            };

            const comparisonWidgetPreview = {
              id: crypto.randomUUID(),
              portfolio_id: portfolioId,
              type: 'd3_json',
              title: comparisonTitle,
              config: comparisonD3Config,
              position: 0,
              is_preview: true,
            };

            const comparisonPreviewAction: any = {
              id: crypto.randomUUID(),
              session_id: sessionId,
              portfolio_id: portfolioId,
              user_id: userId,
              action_type: 'preview',
              entity_type: 'widget',
              entity_id: comparisonWidgetPreview.id,
              operation_data: {
                table: 'widgets',
                after: comparisonWidgetPreview,
                is_preview: true,
              },
              ai_reasoning: `Created comparison chart for ${args.metric_code}`,
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder,
            };

            return {
              action: comparisonPreviewAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: comparisonWidgetPreview,
                message: `Generated a bar chart comparing ${args.metric_code} across ${chartData.length} holdings.`,
              },
            };
          }

          case 'allocation_breakdown': {
            const { data: holdings } = await this.supabase
              .from('holdings')
              .select('name, funds_allocated')
              .eq('portfolio_id', portfolioId)
              .order('funds_allocated', { ascending: false })
              .limit(limit);

            const chartData = (holdings || []).map((h: any) => ({
              name: h.name,
              funds: h.funds_allocated || 0,
            }));

            const { previewAction: allocAction, widgetPreview: allocWidget } = createChartPreview(
              'Portfolio Allocation',
              'donut',
              chartData,
              'name',
              'funds',
              CHART_COLORS
            );

            return {
              action: allocAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: allocWidget,
                message: `Generated a donut chart showing portfolio allocation across ${chartData.length} holdings.`,
              },
            };
          }

          case 'status_breakdown': {
            const { data: holdings } = await this.supabase
              .from('holdings')
              .select('status')
              .eq('portfolio_id', portfolioId);

            const statuses: Record<string, number> = {};
            (holdings || []).forEach((h: any) => {
              const status = h.status || 'Unknown';
              statuses[status] = (statuses[status] || 0) + 1;
            });

            const chartData = Object.entries(statuses)
              .map(([status, count]) => ({ status, count }));

            const { previewAction: statusAction, widgetPreview: statusWidget } = createChartPreview(
              'Holdings by Status',
              'pie',
              chartData,
              'status',
              'count',
              ['#10b981', '#6b7280', '#f59e0b']
            );

            return {
              action: statusAction,
              output: {
                data: chartData,
                chart_generated: true,
                widget: statusWidget,
                message: `Generated a pie chart showing holdings by status.`,
              },
            };
          }

          default:
            throw new Error(`Unknown data_type: ${args.data_type}`);
        }
      }

      case 'generate_d3_chart': {
        const isPieOrDonut = args.chart_type === 'pie' || args.chart_type === 'donut';

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
            table: 'widgets',
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

      case 'generate_holding_report': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        // Parse optional parameters
        const requestedMetrics = args.metric_codes || [];
        const chartPrefs = args.chart_preferences || [];
        const includeSections = args.include_sections || ['overview', 'financials', 'impact', 'trends'];
        const timeRange = args.time_range || 'all';

        // Calculate date filter based on time_range
        const getTimeRangeStart = (range: string): string => {
          const now = new Date();
          switch (range) {
            case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
            case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
            case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
            case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString();
            default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
          }
        };
        const timeRangeStart = getTimeRangeStart(timeRange);

        const { data: holdingData } = await this.supabase
          .from('holdings')
          .select('*, charities(*)')
          .eq('id', args.holding_id)
          .single();

        if (!holdingData) {
          throw new Error(`Holding ${args.holding_id} not found`);
        }

        let metricFactsQuery = this.supabase
          .from('metric_facts')
          .select('metric_code, value, unit, period_end')
          .eq('holding_id', args.holding_id)
          .gte('period_end', timeRangeStart)
          .order('period_end', { ascending: true });

        // Filter by requested metrics if specified
        if (requestedMetrics.length > 0) {
          metricFactsQuery = metricFactsQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
        }

        const { data: metricFacts } = await metricFactsQuery;
        const facts = metricFacts || [];

        const metricGroups: Record<string, Array<{ date: string; value: number; unit: string | null }>> = {};
        facts.forEach((f: any) => {
          const code = f.metric_code;
          if (!metricGroups[code]) metricGroups[code] = [];
          metricGroups[code].push({
            date: f.period_end || 'unknown',
            value: Number(f.value || 0),
            unit: f.unit,
          });
        });

        // Build content_blocks array for structured output
        const contentBlocks: Array<{ type: 'text' | 'chart'; content?: string; widget?: any }> = [];
        const additionalActions: any[] = [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        let chartIndex = 0;

        // Helper to get chart type preference
        const getChartType = (metricCode: string): string => {
          const pref = chartPrefs.find((p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase());
          return pref?.chart_type || 'line';
        };

        // Build metric summaries
        const metricSummaries: Record<string, { latest: number; total: number; count: number; unit: string | null; earliest: string; latest_date: string }> = {};
        for (const [code, series] of Object.entries(metricGroups)) {
          const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
          metricSummaries[code] = {
            latest: sorted[sorted.length - 1].value,
            total: sorted.reduce((s, d) => s + d.value, 0),
            count: sorted.length,
            unit: sorted[0].unit,
            earliest: sorted[0].date,
            latest_date: sorted[sorted.length - 1].date,
          };
        }

        // Extract charity context
        const charity = holdingData.charities;
        const charityContext = charity ? {
          name: charity.name,
          legal_name: charity.legal_name,
          ein: charity.ein,
          mission: charity.mission_statement,
          description: charity.description,
          sector: charity.sector,
          website: charity.website,
          location: [charity.city, charity.state, charity.country].filter(Boolean).join(', '),
          annual_revenue: charity.annual_revenue,
          annual_expenses: charity.annual_expenses,
          program_expense_ratio: charity.program_expense_ratio,
          charity_navigator_rating: charity.charity_navigator_rating,
          impact_focus: charity.impact_focus,
        } : null;

        // Add overview section
        if (includeSections.includes('overview')) {
          contentBlocks.push({
            type: 'text',
            content: `## Overview\n\n**${holdingData.name}** is a ${holdingData.status || 'Active'} holding in the ${holdingData.sector || 'General'} sector${holdingData.country ? `, based in ${holdingData.country}` : ''}.${charityContext?.mission ? `\n\n**Mission:** ${charityContext.mission}` : ''}`,
          });
        }

        // Add financials section
        if (includeSections.includes('financials') && (holdingData.funds_allocated || charityContext?.annual_revenue)) {
          let financialText = '## Financial Overview\n\n';
          if (holdingData.funds_allocated) {
            financialText += `- **Funds Allocated:** $${holdingData.funds_allocated.toLocaleString()}\n`;
          }
          if (holdingData.nav) {
            financialText += `- **Current NAV:** $${holdingData.nav.toLocaleString()}\n`;
          }
          if (charityContext?.annual_revenue) {
            financialText += `- **Annual Revenue:** $${charityContext.annual_revenue.toLocaleString()}\n`;
          }
          if (charityContext?.program_expense_ratio) {
            financialText += `- **Program Expense Ratio:** ${(charityContext.program_expense_ratio * 100).toFixed(1)}%\n`;
          }
          if (charityContext?.charity_navigator_rating) {
            financialText += `- **Charity Navigator Rating:** ${charityContext.charity_navigator_rating}/4 stars\n`;
          }
          contentBlocks.push({ type: 'text', content: financialText });
        }

        // Add impact/trends section with charts
        if (includeSections.includes('impact') || includeSections.includes('trends')) {
          const metricsToChart = Object.keys(metricGroups);

          if (metricsToChart.length > 0) {
            contentBlocks.push({
              type: 'text',
              content: '## Impact Metrics\n\nThe following charts show key performance indicators over time:',
            });

            for (const metricCode of metricsToChart) {
              const series = metricGroups[metricCode];
              if (series.length >= 2) {
                const chartType = getChartType(metricCode);
                const chartData = series.map(s => ({ date: s.date, value: s.value }));
                const unit = series[0]?.unit || '';
                const chartTitle = `${metricCode}${unit ? ` (${unit})` : ''}`;

                const d3Config = {
                  d3: {
                    kind: chartType,
                    data: chartData,
                    encoding: { x: 'date', y: 'value' },
                    options: {
                      xType: 'time',
                      xAxisLabel: 'Date',
                      yAxisLabel: unit || 'Value',
                      colors: [palette[chartIndex % palette.length]],
                    },
                  },
                };

                const widgetPreview = {
                  id: crypto.randomUUID(),
                  portfolio_id: portfolioId,
                  holding_id: args.holding_id,
                  type: 'd3_json',
                  title: chartTitle,
                  config: d3Config,
                  position: chartIndex,
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
                    table: 'widgets',
                    after: widgetPreview,
                    is_preview: true,
                  },
                  ai_reasoning: `Auto-generated ${chartType} chart for ${metricCode} in holding report`,
                  user_prompt: userPrompt,
                  status: 'preview',
                  batch_id: batchId,
                  sequence_order: sequenceOrder + chartIndex + 1,
                };

                additionalActions.push(previewAction);
                contentBlocks.push({
                  type: 'chart',
                  widget: widgetPreview,
                });

                // Add metric summary text after chart
                const summary = metricSummaries[metricCode];
                contentBlocks.push({
                  type: 'text',
                  content: `**${metricCode}**: Latest value of ${summary.latest.toLocaleString()}${unit ? ' ' + unit : ''} (${summary.count} data points from ${summary.earliest} to ${summary.latest_date}).\n`,
                });

                chartIndex++;
              }
            }
          } else {
            contentBlocks.push({
              type: 'text',
              content: '## Impact Metrics\n\nNo metric data available for this holding in the selected time range.',
            });
          }
        }

        return {
          action: null,
          additionalActions,
          output: {
            content_blocks: contentBlocks,
            holding: {
              id: holdingData.id,
              name: holdingData.name,
              sector: holdingData.sector,
              country: holdingData.country,
              status: holdingData.status,
              funds_allocated: holdingData.funds_allocated,
              nav: holdingData.nav,
              asset_type: holdingData.asset_type,
            },
            charity: charityContext,
            metrics: metricSummaries,
            charts_generated: chartIndex,
            time_range: timeRange,
            sections_included: includeSections,
          },
        };
      }

      case 'generate_custom_report': {
        const scope = args.scope;
        const requestedMetrics = args.metric_codes || [];
        const chartPrefs = args.chart_preferences || [];
        const includeSections = args.include_sections || ['overview', 'impact', 'trends'];
        const timeRange = args.time_range || '12m';
        const customTitle = args.title;

        // Calculate date filter
        const getTimeRangeStart = (range: string): string => {
          const now = new Date();
          switch (range) {
            case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
            case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
            case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
            case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString();
            default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
          }
        };
        const timeRangeStart = getTimeRangeStart(timeRange);

        const contentBlocks: Array<{ type: 'text' | 'chart'; content?: string; widget?: any }> = [];
        const additionalActions: any[] = [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        let chartIndex = 0;

        // Helper to get chart type preference
        const getChartType = (metricCode: string): string => {
          const pref = chartPrefs.find((p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase());
          return pref?.chart_type || 'line';
        };

        if (scope === 'holding') {
          if (!args.holding_id) {
            throw new ValidationError('holding_id is required when scope is "holding"');
          }
          InputValidator.validateUUID(args.holding_id, 'holding_id');

          // Delegate to generate_holding_report logic
          return this.executeTool('generate_holding_report', {
            holding_id: args.holding_id,
            metric_codes: requestedMetrics,
            chart_preferences: chartPrefs,
            include_sections: includeSections,
            time_range: timeRange,
          }, portfolioId, userId, sessionId, batchId, sequenceOrder, userPrompt);
        }

        if (scope === 'sector') {
          if (!args.sector) {
            throw new ValidationError('sector is required when scope is "sector"');
          }

          // Get holdings in sector
          const { data: holdings } = await this.supabase
            .from('holdings')
            .select('id, name, sector, funds_allocated, status')
            .eq('portfolio_id', portfolioId)
            .ilike('sector', `%${args.sector}%`);

          if (!holdings || holdings.length === 0) {
            return {
              action: null,
              output: {
                content_blocks: [{
                  type: 'text',
                  content: `## Sector Report: ${args.sector}\n\nNo holdings found in the ${args.sector} sector.`,
                }],
                error: `No holdings found in sector "${args.sector}"`,
              },
            };
          }

          const holdingIds = holdings.map((h: any) => h.id);
          const reportTitle = customTitle || `${args.sector} Sector Report`;

          contentBlocks.push({
            type: 'text',
            content: `# ${reportTitle}\n\n**${holdings.length} holdings** in the ${args.sector} sector, with total allocation of $${holdings.reduce((s: number, h: any) => s + (h.funds_allocated || 0), 0).toLocaleString()}.`,
          });

          // Get metrics for these holdings
          let metricQuery = this.supabase
            .from('metric_facts')
            .select('metric_code, value, unit, period_end, holding_id')
            .in('holding_id', holdingIds)
            .gte('period_end', timeRangeStart)
            .order('period_end', { ascending: true });

          if (requestedMetrics.length > 0) {
            metricQuery = metricQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
          }

          const { data: metricFacts } = await metricQuery;
          const facts = metricFacts || [];

          // Aggregate by metric and period
          const metricGroups: Record<string, Record<string, number>> = {};
          facts.forEach((f: any) => {
            const code = f.metric_code;
            const period = f.period_end;
            if (!metricGroups[code]) metricGroups[code] = {};
            metricGroups[code][period] = (metricGroups[code][period] || 0) + Number(f.value || 0);
          });

          // Generate charts for each metric
          for (const [metricCode, periodData] of Object.entries(metricGroups)) {
            const chartData = Object.entries(periodData)
              .map(([date, value]) => ({ date, value }))
              .sort((a, b) => a.date.localeCompare(b.date));

            if (chartData.length >= 2) {
              const chartType = getChartType(metricCode);
              const chartTitle = `${args.sector} — ${metricCode} Trend`;

              const d3Config = {
                d3: {
                  kind: chartType,
                  data: chartData,
                  encoding: { x: 'date', y: 'value' },
                  options: {
                    xType: 'time',
                    colors: [palette[chartIndex % palette.length]],
                  },
                },
              };

              const widgetPreview = {
                id: crypto.randomUUID(),
                portfolio_id: portfolioId,
                type: 'd3_json',
                title: chartTitle,
                config: d3Config,
                position: chartIndex,
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
                  table: 'widgets',
                  after: widgetPreview,
                  is_preview: true,
                },
                ai_reasoning: `Sector report chart for ${metricCode}`,
                user_prompt: userPrompt,
                status: 'preview',
                batch_id: batchId,
                sequence_order: sequenceOrder + chartIndex + 1,
              };

              additionalActions.push(previewAction);
              contentBlocks.push({ type: 'chart', widget: widgetPreview });
              chartIndex++;
            }
          }

          return {
            action: null,
            additionalActions,
            output: {
              content_blocks: contentBlocks,
              scope: 'sector',
              sector: args.sector,
              holdings_count: holdings.length,
              charts_generated: chartIndex,
              time_range: timeRange,
            },
          };
        }

        // Portfolio-level report
        const { data: holdings } = await this.supabase
          .from('holdings')
          .select('id, name, sector, funds_allocated, status')
          .eq('portfolio_id', portfolioId)
          .order('funds_allocated', { ascending: false });

        const holdingsData = holdings || [];
        const holdingIds = holdingsData.map((h: any) => h.id);
        const reportTitle = customTitle || 'Portfolio Report';

        const totalAUM = holdingsData.reduce((s: number, h: any) => s + (h.funds_allocated || 0), 0);
        const totalNAV = holdingsData.reduce((s: number, h: any) => s + (h.nav || 0), 0);

        contentBlocks.push({
          type: 'text',
          content: `# ${reportTitle}\n\n**Portfolio Overview**\n- ${holdingsData.length} holdings\n- Total AUM: $${totalAUM.toLocaleString()}\n${totalNAV > 0 ? `- Total NAV: $${totalNAV.toLocaleString()}` : ''}`,
        });

        // Sector breakdown chart
        if (includeSections.includes('overview')) {
          const sectorBreakdown: Record<string, number> = {};
          holdingsData.forEach((h: any) => {
            const sector = h.sector || 'Unspecified';
            sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + (h.funds_allocated || 0);
          });

          const sectorData = Object.entries(sectorBreakdown)
            .map(([sector, funds]) => ({ sector, funds }))
            .sort((a, b) => b.funds - a.funds);

          if (sectorData.length > 1) {
            const d3Config = {
              d3: {
                kind: sectorData.length <= 6 ? 'pie' : 'bar',
                data: sectorData,
                encoding: { x: 'sector', y: 'funds', label: 'sector', value: 'funds' },
                options: { colors: palette },
              },
            };

            const widgetPreview = {
              id: crypto.randomUUID(),
              portfolio_id: portfolioId,
              type: 'd3_json',
              title: 'Portfolio Allocation by Sector',
              config: d3Config,
              position: chartIndex,
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
                table: 'widgets',
                after: widgetPreview,
                is_preview: true,
              },
              ai_reasoning: 'Portfolio sector allocation chart',
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder + chartIndex + 1,
            };

            additionalActions.push(previewAction);
            contentBlocks.push({ type: 'chart', widget: widgetPreview });
            chartIndex++;
          }
        }

        // Get metrics for all holdings
        if (includeSections.includes('impact') || includeSections.includes('trends')) {
          let metricQuery = this.supabase
            .from('metric_facts')
            .select('metric_code, value, unit, period_end')
            .in('holding_id', holdingIds)
            .gte('period_end', timeRangeStart)
            .order('period_end', { ascending: true });

          if (requestedMetrics.length > 0) {
            metricQuery = metricQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
          }

          const { data: metricFacts } = await metricQuery;
          const facts = metricFacts || [];

          // Aggregate by metric and period
          const metricGroups: Record<string, Record<string, number>> = {};
          facts.forEach((f: any) => {
            const code = f.metric_code;
            const period = f.period_end;
            if (!metricGroups[code]) metricGroups[code] = {};
            metricGroups[code][period] = (metricGroups[code][period] || 0) + Number(f.value || 0);
          });

          if (Object.keys(metricGroups).length > 0) {
            contentBlocks.push({
              type: 'text',
              content: '## Impact Metrics',
            });

            for (const [metricCode, periodData] of Object.entries(metricGroups)) {
              const chartData = Object.entries(periodData)
                .map(([date, value]) => ({ date, value }))
                .sort((a, b) => a.date.localeCompare(b.date));

              if (chartData.length >= 2) {
                const chartType = getChartType(metricCode);
                const chartTitle = `${metricCode} Trend`;

                const d3Config = {
                  d3: {
                    kind: chartType,
                    data: chartData,
                    encoding: { x: 'date', y: 'value' },
                    options: {
                      xType: 'time',
                      colors: [palette[chartIndex % palette.length]],
                    },
                  },
                };

                const widgetPreview = {
                  id: crypto.randomUUID(),
                  portfolio_id: portfolioId,
                  type: 'd3_json',
                  title: chartTitle,
                  config: d3Config,
                  position: chartIndex,
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
                    table: 'widgets',
                    after: widgetPreview,
                    is_preview: true,
                  },
                  ai_reasoning: `Portfolio report chart for ${metricCode}`,
                  user_prompt: userPrompt,
                  status: 'preview',
                  batch_id: batchId,
                  sequence_order: sequenceOrder + chartIndex + 1,
                };

                additionalActions.push(previewAction);
                contentBlocks.push({ type: 'chart', widget: widgetPreview });
                chartIndex++;
              }
            }
          }
        }

        return {
          action: null,
          additionalActions,
          output: {
            content_blocks: contentBlocks,
            scope: 'portfolio',
            holdings_count: holdingsData.length,
            total_aum: totalAUM,
            total_nav: totalNAV,
            charts_generated: chartIndex,
            time_range: timeRange,
            sections_included: includeSections,
          },
        };
      }

      case 'save_report_template': {
        InputValidator.validateString(args.name, 'name', { maxLength: 200 });
        InputValidator.validateEnum(args.scope, 'scope', ['portfolio', 'holding', 'sector'] as const);

        if (!args.name) {
          throw new ValidationError('name is required');
        }
        if (!args.scope) {
          throw new ValidationError('scope is required');
        }
        if (!args.config) {
          throw new ValidationError('config is required');
        }

        const { data: template, error } = await this.supabase
          .from('report_templates')
          .insert({
            portfolio_id: portfolioId,
            name: args.name,
            scope: args.scope,
            config: args.config,
            is_default: args.is_default || false,
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to save template: ${error.message}`);
        }

        return {
          action: null,
          output: {
            success: true,
            template: template,
            message: `Report template "${args.name}" saved successfully.`,
          },
        };
      }

      case 'list_report_templates': {
        let query = this.supabase
          .from('report_templates')
          .select('id, name, scope, config, is_default, created_at')
          .eq('portfolio_id', portfolioId)
          .order('created_at', { ascending: false });

        if (args.scope) {
          InputValidator.validateEnum(args.scope, 'scope', ['portfolio', 'holding', 'sector'] as const);
          query = query.eq('scope', args.scope);
        }

        const { data: templates, error } = await query;

        if (error) {
          throw new Error(`Failed to list templates: ${error.message}`);
        }

        return {
          action: null,
          output: {
            templates: templates || [],
            count: templates?.length || 0,
          },
        };
      }

      // ==================== EXPORT DATA ====================
      case 'export_data': {
        const dataType = args.data_type;
        const format = args.format || 'csv';
        const holdingId = args.holding_id;
        const dateFrom = args.date_from;
        const dateTo = args.date_to;

        let data: any[] = [];
        let filename = '';

        switch (dataType) {
          case 'holdings': {
            let query = this.supabase
              .from('holdings')
              .select('id, name, sector, country, status, funds_allocated, asset_type, description, created_at')
              .eq('portfolio_id', portfolioId);

            if (holdingId) {
              query = query.eq('id', holdingId);
            }

            const { data: holdings, error } = await query;
            if (error) throw new Error(`Failed to fetch holdings: ${error.message}`);
            data = holdings || [];
            filename = `holdings_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          case 'metrics': {
            let query = this.supabase
              .from('metric_facts')
              .select(`
                id,
                holding_id,
                holdings(name),
                metric_code,
                value,
                unit,
                period_start,
                period_end,
                created_at
              `)
              .eq('portfolio_id', portfolioId);

            if (holdingId) {
              query = query.eq('holding_id', holdingId);
            }
            if (dateFrom) {
              query = query.gte('period_start', dateFrom);
            }
            if (dateTo) {
              query = query.lte('period_end', dateTo);
            }

            const { data: metrics, error } = await query.order('period_start', { ascending: false });
            if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);

            // Flatten the data
            data = (metrics || []).map((m: any) => ({
              id: m.id,
              holding_id: m.holding_id,
              holding_name: m.holdings?.name,
              metric_code: m.metric_code,
              value: m.value,
              unit: m.unit,
              period_start: m.period_start,
              period_end: m.period_end,
              created_at: m.created_at,
            }));
            filename = `metrics_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          case 'contributions': {
            const { data: contributions, error } = await this.supabase
              .from('contributions')
              .select('*')
              .eq('portfolio_id', portfolioId)
              .order('contribution_date', { ascending: false });

            if (error) throw new Error(`Failed to fetch contributions: ${error.message}`);
            data = contributions || [];
            filename = `contributions_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          default:
            throw new ValidationError(`Unknown data type: ${dataType}`);
        }

        if (data.length === 0) {
          return {
            action: null,
            output: {
              message: `No ${dataType} data found to export`,
              count: 0,
            },
          };
        }

        // Format the data based on requested format
        let exportContent: string;
        let mimeType: string;

        if (format === 'json') {
          exportContent = JSON.stringify(data, null, 2);
          mimeType = 'application/json';
        } else if (format === 'csv') {
          // Convert to CSV
          const headers = Object.keys(data[0]);
          const csvRows = [
            headers.join(','),
            ...data.map(row =>
              headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                  return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
              }).join(',')
            ),
          ];
          exportContent = csvRows.join('\n');
          mimeType = 'text/csv';
        } else {
          // For xlsx, return the data and let frontend handle it
          exportContent = JSON.stringify(data);
          mimeType = 'application/json';
        }

        return {
          action: null,
          output: {
            filename: `${filename}.${format}`,
            format,
            mimeType,
            content: exportContent,
            rowCount: data.length,
            message: `Exported ${data.length} ${dataType} records`,
          },
        };
      }

      // ==================== EXTERNAL DATA MODULE ====================
      case 'refresh_charity_data': {
        const holdingId = args.holding_id;
        const ein = args.ein;

        let targetEin = ein;
        let holdingName = '';

        // If holdingId provided, look up the EIN
        if (holdingId && !ein) {
          const { data: holding, error } = await this.supabase
            .from('holdings')
            .select('name, charity_id, charities(ein)')
            .eq('id', holdingId)
            .single();

          if (error) throw new Error(`Holding not found: ${error.message}`);
          holdingName = holding?.name || '';
          targetEin = (holding as any)?.charities?.ein;
        }

        if (!targetEin) {
          return {
            action: null,
            output: {
              error: 'No EIN found for this holding. Link the holding to a charity first.',
              success: false,
            },
          };
        }

        // Fetch from external sources (simplified - actual implementation would use the services)
        const charityData: any = {
          ein: targetEin,
          refreshed_at: new Date().toISOString(),
        };

        // Try to fetch from charity_ratings cache or external API
        const { data: cachedRating } = await this.supabase
          .from('charity_ratings')
          .select('*')
          .eq('ein', targetEin)
          .maybeSingle();

        if (cachedRating) {
          charityData.ratings = cachedRating;
          charityData.source = 'cache';
        } else {
          charityData.message = 'No cached data found. External API call would be made here.';
          charityData.source = 'none';
        }

        return {
          action: null,
          output: {
            success: true,
            holding_name: holdingName,
            ein: targetEin,
            data: charityData,
          },
        };
      }

      case 'search_similar_charities': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        const { data: holding, error: holdingError } = await this.supabase
          .from('holdings')
          .select('name, sector, country, funds_allocated')
          .eq('id', args.holding_id)
          .single();

        if (holdingError) throw new Error(`Holding not found: ${holdingError.message}`);

        const sector = args.sector || holding?.sector;
        const limit = args.limit || 5;

        // Search for similar charities in the charities table
        let query = this.supabase
          .from('charities')
          .select('ein, name, city, state, ntee_code, total_revenue, rating_overall')
          .limit(limit);

        if (sector) {
          // Match on NTEE code prefix or search in mission
          query = query.ilike('ntee_code', `${sector.charAt(0)}%`);
        }

        const { data: similar, error } = await query;

        return {
          action: null,
          output: {
            reference_holding: holding?.name,
            sector: sector,
            similar_charities: similar || [],
            count: similar?.length || 0,
          },
        };
      }

      case 'get_charity_financials': {
        const holdingId = args.holding_id;
        const ein = args.ein;

        let targetEin = ein;

        if (holdingId && !ein) {
          const { data: holding } = await this.supabase
            .from('holdings')
            .select('charity_id, charities(ein, name, total_revenue, total_expenses, total_assets)')
            .eq('id', holdingId)
            .single();

          if ((holding as any)?.charities) {
            return {
              action: null,
              output: {
                source: 'database',
                financials: (holding as any).charities,
              },
            };
          }
          targetEin = (holding as any)?.charities?.ein;
        }

        if (targetEin) {
          const { data: charity } = await this.supabase
            .from('charities')
            .select('*')
            .eq('ein', targetEin)
            .single();

          if (charity) {
            return {
              action: null,
              output: {
                source: 'database',
                financials: {
                  ein: charity.ein,
                  name: charity.name,
                  total_revenue: charity.total_revenue,
                  total_expenses: charity.total_expenses,
                  total_assets: charity.total_assets,
                  program_expense_ratio: charity.program_expense_ratio,
                  admin_expense_ratio: charity.admin_expense_ratio,
                  fundraising_expense_ratio: charity.fundraising_expense_ratio,
                },
              },
            };
          }
        }

        return {
          action: null,
          output: {
            error: 'No financial data found. Try refreshing charity data first.',
          },
        };
      }

      // ==================== TAX OPTIMIZATION MODULE ====================
      case 'run_tax_scenario': {
        const scenarioType = args.scenario_type;
        const donationAmount = args.donation_amount;
        const taxYear = args.tax_year || new Date().getFullYear();

        // Get tax profile for context
        const { data: taxProfile } = await this.supabase
          .from('tax_profiles')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .maybeSingle();

        const agi = taxProfile?.estimated_agi || 500000; // Default if no profile
        const taxBracket = taxProfile?.marginal_rate || 0.37;

        let result: any = {
          scenario_type: scenarioType,
          donation_amount: donationAmount,
          tax_year: taxYear,
          agi,
          tax_bracket: taxBracket,
        };

        switch (scenarioType) {
          case 'cash_vs_stock': {
            // Cash donation
            const cashDeductionLimit = agi * 0.6;
            const cashDeduction = Math.min(donationAmount, cashDeductionLimit);
            const cashTaxSavings = cashDeduction * taxBracket;
            const cashCarryforward = Math.max(0, donationAmount - cashDeductionLimit);

            // Stock donation (assuming long-term appreciated)
            const stockDeductionLimit = agi * 0.3;
            const stockDeduction = Math.min(donationAmount, stockDeductionLimit);
            // Stock also avoids capital gains
            const assets = args.assets || [];
            let totalGainAvoided = 0;
            assets.forEach((a: any) => {
              if (a.holding_period === 'long') {
                totalGainAvoided += (a.current_value - a.cost_basis);
              }
            });
            const capGainsTaxAvoided = totalGainAvoided * 0.20; // Assume 20% LTCG rate
            const stockTaxSavings = (stockDeduction * taxBracket) + capGainsTaxAvoided;
            const stockCarryforward = Math.max(0, donationAmount - stockDeductionLimit);

            result.scenarios = {
              cash: {
                deduction: cashDeduction,
                tax_savings: cashTaxSavings,
                carryforward: cashCarryforward,
                effective_cost: donationAmount - cashTaxSavings,
              },
              appreciated_stock: {
                deduction: stockDeduction,
                tax_savings: stockTaxSavings,
                capital_gains_avoided: capGainsTaxAvoided,
                carryforward: stockCarryforward,
                effective_cost: donationAmount - stockTaxSavings,
              },
            };
            result.recommendation = stockTaxSavings > cashTaxSavings
              ? 'Donating appreciated stock saves more in taxes'
              : 'Cash donation provides better tax benefits in this case';
            break;
          }

          case 'bunching': {
            // Compare spreading over 2 years vs bunching in 1
            const standardDeduction = 29200; // 2024 MFJ
            const spreadYearlyDonation = donationAmount / 2;
            const spreadDeduction = Math.max(0, spreadYearlyDonation - standardDeduction) * 2;
            const bunchedDeduction = Math.max(0, donationAmount - standardDeduction);

            result.scenarios = {
              spread_over_2_years: {
                yearly_donation: spreadYearlyDonation,
                total_itemized_benefit: spreadDeduction,
                tax_savings: spreadDeduction * taxBracket,
              },
              bunched_in_1_year: {
                donation: donationAmount,
                itemized_benefit: bunchedDeduction,
                tax_savings: bunchedDeduction * taxBracket,
              },
            };
            result.recommendation = bunchedDeduction > spreadDeduction
              ? 'Bunching donations in one year provides better tax benefits'
              : 'Spreading donations may work better for your situation';
            break;
          }

          default:
            result.message = `Scenario type '${scenarioType}' analysis would be performed here`;
        }

        return { action: null, output: result };
      }

      case 'calculate_deduction': {
        const amount = args.amount;
        const assetType = args.asset_type;
        const recipientType = args.recipient_type;

        // Get AGI from args or tax profile
        let agi = args.agi;
        if (!agi) {
          const { data: taxProfile } = await this.supabase
            .from('tax_profiles')
            .select('estimated_agi')
            .eq('portfolio_id', portfolioId)
            .maybeSingle();
          agi = taxProfile?.estimated_agi || 500000;
        }

        // Determine AGI limit based on asset and recipient type
        let agiLimitPercent = 0.6; // Default for cash to public charity

        if (assetType === 'cash' && recipientType === 'public_charity') {
          agiLimitPercent = 0.6;
        } else if (assetType === 'cash' && recipientType === 'private_foundation') {
          agiLimitPercent = 0.3;
        } else if (assetType === 'public_stock' && recipientType === 'public_charity') {
          agiLimitPercent = 0.3;
        } else if (assetType === 'public_stock' && recipientType === 'private_foundation') {
          agiLimitPercent = 0.2;
        } else {
          agiLimitPercent = 0.3; // Default for other assets
        }

        const maxDeduction = agi * agiLimitPercent;
        const allowedDeduction = Math.min(amount, maxDeduction);
        const carryforward = Math.max(0, amount - maxDeduction);

        return {
          action: null,
          output: {
            contribution_amount: amount,
            asset_type: assetType,
            recipient_type: recipientType,
            agi,
            agi_limit_percent: agiLimitPercent * 100,
            max_deduction_this_year: maxDeduction,
            allowed_deduction: allowedDeduction,
            carryforward_amount: carryforward,
            carryforward_years: carryforward > 0 ? 5 : 0,
          },
        };
      }

      case 'get_carryforward': {
        const taxYear = args.tax_year || new Date().getFullYear();

        // Query carryforward data from contributions
        const { data: contributions } = await this.supabase
          .from('contributions')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .not('carryforward_amount', 'is', null)
          .gt('carryforward_amount', 0);

        const carryforwards = (contributions || [])
          .filter((c: any) => {
            const contribYear = new Date(c.contribution_date).getFullYear();
            const yearsAgo = taxYear - contribYear;
            return yearsAgo > 0 && yearsAgo <= 5; // Within 5-year window
          })
          .map((c: any) => ({
            contribution_date: c.contribution_date,
            original_amount: c.amount,
            carryforward_amount: c.carryforward_amount,
            years_remaining: 5 - (taxYear - new Date(c.contribution_date).getFullYear()),
          }));

        const totalCarryforward = carryforwards.reduce(
          (sum: number, c: any) => sum + (c.carryforward_amount || 0),
          0
        );

        return {
          action: null,
          output: {
            tax_year: taxYear,
            total_carryforward: totalCarryforward,
            carryforwards,
            message: totalCarryforward > 0
              ? `You have $${totalCarryforward.toLocaleString()} in charitable contribution carryforwards available`
              : 'No carryforward amounts found',
          },
        };
      }

      // ==================== ANALYTICS MODULE ====================
      case 'project_metric_trend': {
        const metricCode = args.metric_code;
        const holdingId = args.holding_id;
        const periodsAhead = args.periods_ahead || 4;
        const method = args.method || 'linear';

        // Get historical data
        let query = this.supabase
          .from('metric_facts')
          .select('value, period_start, period_end')
          .eq('portfolio_id', portfolioId)
          .eq('metric_code', metricCode)
          .order('period_start', { ascending: true });

        if (holdingId) {
          query = query.eq('holding_id', holdingId);
        }

        const { data: historicalData, error } = await query;

        if (error || !historicalData || historicalData.length < 2) {
          return {
            action: null,
            output: {
              error: 'Not enough historical data for projection. Need at least 2 data points.',
              data_points: historicalData?.length || 0,
            },
          };
        }

        // Simple linear projection
        const values = historicalData.map((d: any) => d.value);
        const n = values.length;

        // Calculate slope and intercept
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((a: number, b: number) => a + b, 0);
        const sumXY = values.reduce((sum: number, y: number, x: number) => sum + x * y, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Generate projections
        const projections = [];
        const lastPeriod = new Date(historicalData[n - 1].period_end || historicalData[n - 1].period_start);

        for (let i = 1; i <= periodsAhead; i++) {
          const projectedValue = intercept + slope * (n - 1 + i);
          const projectedDate = new Date(lastPeriod);
          projectedDate.setMonth(projectedDate.getMonth() + 3 * i); // Assuming quarterly

          // Simple confidence interval (gets wider further out)
          const stdDev = Math.sqrt(
            values.reduce((sum: number, v: number, idx: number) => {
              const predicted = intercept + slope * idx;
              return sum + Math.pow(v - predicted, 2);
            }, 0) / (n - 2)
          );
          const confidenceMargin = stdDev * 1.96 * Math.sqrt(1 + 1/n + Math.pow(i, 2) / sumX2);

          projections.push({
            period: projectedDate.toISOString().split('T')[0],
            projected_value: Math.max(0, projectedValue),
            confidence_low: Math.max(0, projectedValue - confidenceMargin),
            confidence_high: projectedValue + confidenceMargin,
          });
        }

        return {
          action: null,
          output: {
            metric_code: metricCode,
            method,
            historical_data_points: n,
            trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
            slope_per_period: slope,
            projections,
          },
        };
      }

      case 'benchmark_holding': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        const { data: holding, error } = await this.supabase
          .from('holdings')
          .select('name, sector, country, funds_allocated')
          .eq('id', args.holding_id)
          .single();

        if (error) throw new Error(`Holding not found: ${error.message}`);

        const benchmarkType = args.benchmark_type || 'sector';
        const metrics = args.metrics || ['funds_allocated'];

        // Get peer holdings for comparison
        let peerQuery = this.supabase
          .from('holdings')
          .select('id, name, sector, funds_allocated')
          .eq('portfolio_id', portfolioId)
          .neq('id', args.holding_id);

        if (benchmarkType === 'sector' && holding?.sector) {
          peerQuery = peerQuery.eq('sector', holding.sector);
        }

        const { data: peers } = await peerQuery;

        // Calculate percentiles
        const peerValues = (peers || []).map((p: any) => p.funds_allocated || 0);
        const holdingValue = holding?.funds_allocated || 0;
        const allValues = [...peerValues, holdingValue].sort((a, b) => a - b);

        const percentile = allValues.length > 1
          ? (allValues.indexOf(holdingValue) / (allValues.length - 1)) * 100
          : 50;

        return {
          action: null,
          output: {
            holding: holding?.name,
            benchmark_type: benchmarkType,
            peer_count: peers?.length || 0,
            metrics: {
              funds_allocated: {
                value: holdingValue,
                percentile: Math.round(percentile),
                peer_average: peerValues.length > 0
                  ? peerValues.reduce((a: number, b: number) => a + b, 0) / peerValues.length
                  : null,
                peer_median: peerValues.length > 0
                  ? peerValues[Math.floor(peerValues.length / 2)]
                  : null,
              },
            },
          },
        };
      }

      case 'analyze_portfolio_risk': {
        const riskType = args.risk_type || 'all';

        // Get all holdings
        const { data: holdings } = await this.supabase
          .from('holdings')
          .select('id, name, sector, country, funds_allocated')
          .eq('portfolio_id', portfolioId);

        if (!holdings || holdings.length === 0) {
          return {
            action: null,
            output: { error: 'No holdings found in portfolio' },
          };
        }

        const totalAllocation = holdings.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
        const result: any = { total_holdings: holdings.length, total_allocation: totalAllocation };

        // Concentration risk (single holding exposure)
        if (riskType === 'concentration' || riskType === 'all') {
          const sorted = [...holdings].sort((a: any, b: any) =>
            (b.funds_allocated || 0) - (a.funds_allocated || 0)
          );
          const top3 = sorted.slice(0, 3);
          const top3Percent = totalAllocation > 0
            ? (top3.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0) / totalAllocation) * 100
            : 0;

          result.concentration = {
            top_3_holdings: top3.map((h: any) => ({
              name: h.name,
              allocation: h.funds_allocated,
              percent: totalAllocation > 0 ? ((h.funds_allocated || 0) / totalAllocation) * 100 : 0,
            })),
            top_3_percent: top3Percent,
            risk_level: top3Percent > 50 ? 'high' : top3Percent > 30 ? 'medium' : 'low',
          };
        }

        // Sector concentration
        if (riskType === 'sector' || riskType === 'all') {
          const bySector: Record<string, number> = {};
          holdings.forEach((h: any) => {
            const sector = h.sector || 'Unknown';
            bySector[sector] = (bySector[sector] || 0) + (h.funds_allocated || 0);
          });

          const sectorEntries = Object.entries(bySector)
            .map(([sector, amount]) => ({
              sector,
              amount,
              percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

          const topSectorPercent = sectorEntries[0]?.percent || 0;

          result.sector_concentration = {
            sectors: sectorEntries,
            top_sector: sectorEntries[0]?.sector,
            top_sector_percent: topSectorPercent,
            risk_level: topSectorPercent > 40 ? 'high' : topSectorPercent > 25 ? 'medium' : 'low',
          };
        }

        // Geographic concentration
        if (riskType === 'geography' || riskType === 'all') {
          const byCountry: Record<string, number> = {};
          holdings.forEach((h: any) => {
            const country = h.country || 'Unknown';
            byCountry[country] = (byCountry[country] || 0) + (h.funds_allocated || 0);
          });

          const countryEntries = Object.entries(byCountry)
            .map(([country, amount]) => ({
              country,
              amount,
              percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

          result.geographic_concentration = {
            countries: countryEntries,
            country_count: countryEntries.length,
            top_country: countryEntries[0]?.country,
            top_country_percent: countryEntries[0]?.percent || 0,
          };
        }

        return { action: null, output: result };
      }

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  /**
   * Get portfolio context for the AI
   */
  private async getPortfolioContext(portfolioId: string) {
    const [
      portfolio,
      holdings,
      metrics,
      portfolioWidgets,
      kpiDefs,
      metricFacts,
      recentActions
    ] = await Promise.all([
      this.supabase
        .from('portfolios')
        .select('id, name, description')
        .eq('id', portfolioId)
        .single(),
      this.supabase
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated, asset_type, description')
        .eq('portfolio_id', portfolioId)
        .order('funds_allocated', { ascending: false, nullsFirst: false }),
      this.supabase
        .from('metrics')
        .select('code, name, unit'),
      this.supabase
        .from('widgets')
        .select('id, type, title')
        .eq('portfolio_id', portfolioId)
        .order('position', { ascending: true }),
      this.supabase
        .from('portfolio_metric_targets')
        .select('metric_code, target_value, display_name, target_date')
        .eq('portfolio_id', portfolioId),
      this.supabase
        .from('metric_facts')
        .select('metric_code, value, unit, period_end, holdings!inner(portfolio_id)')
        .eq('holdings.portfolio_id', portfolioId)
        .order('period_end', { ascending: false }),
      this.supabase
        .from('ai_actions')
        .select('action_type, entity_type, ai_reasoning, created_at')
        .eq('portfolio_id', portfolioId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const holdingsData = holdings.data || [];
    const kpiDefsData = kpiDefs.data || [];
    const factsData = metricFacts.data || [];

    const totalAUM = holdingsData.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = holdingsData.reduce((sum: number, h: any) => sum + (h.nav || 0), 0);

    const sectorBreakdown: Record<string, { count: number; funds: number }> = {};
    holdingsData.forEach((h: any) => {
      const sector: string = h.sector || 'Unspecified';
      if (!sectorBreakdown[sector]) {
        sectorBreakdown[sector] = { count: 0, funds: 0 };
      }
      sectorBreakdown[sector].count++;
      sectorBreakdown[sector].funds += h.funds_allocated || 0;
    });

    const statusBreakdown: Record<string, number> = {};
    holdingsData.forEach((h: any) => {
      const status: string = h.status || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    const kpiSnapshot: Array<{
      metricCode: string;
      displayName: string;
      latestValue: number | null;
      target: number | null;
      unit: string | null;
      percentComplete: number | null;
    }> = [];

    const latestByMetric: Record<string, { value: number; unit: string | null; period: string | null }> = {};
    const byMetricAndPeriod: Record<string, Record<string, { value: number; unit: string | null }>> = {};

    factsData.forEach((fact: any) => {
      const metricCode: string = fact.metric_code;
      const period: string = fact.period_end || 'unknown';

      if (!byMetricAndPeriod[metricCode]) {
        byMetricAndPeriod[metricCode] = {};
      }
      if (!byMetricAndPeriod[metricCode][period]) {
        byMetricAndPeriod[metricCode][period] = { value: 0, unit: fact.unit };
      }
      byMetricAndPeriod[metricCode][period].value += fact.value || 0;
    });

    Object.keys(byMetricAndPeriod).forEach((metricCode) => {
      const periods = Object.keys(byMetricAndPeriod[metricCode]).sort().reverse();
      const latestPeriod = periods[0];
      const latestData = byMetricAndPeriod[metricCode][latestPeriod];
      latestByMetric[metricCode] = {
        value: latestData.value,
        unit: latestData.unit,
        period: latestPeriod !== 'unknown' ? latestPeriod : null,
      };
    });

    kpiDefsData.forEach((kpi: any) => {
      const metricCode: string = kpi.metric_code;
      const latest = latestByMetric[metricCode];
      const latestValue = latest?.value ?? null;
      const target = kpi.target_value;

      kpiSnapshot.push({
        metricCode,
        displayName: kpi.display_name || metricCode,
        latestValue,
        target,
        unit: latest?.unit ?? null,
        percentComplete: target && latestValue !== null
          ? Math.round((latestValue / target) * 100)
          : null,
      });
    });

    Object.keys(latestByMetric).forEach((code: string) => {
      if (!kpiDefsData.some((k: any) => k.metric_code === code)) {
        kpiSnapshot.push({
          metricCode: code,
          displayName: code,
          latestValue: latestByMetric[code].value,
          target: null,
          unit: latestByMetric[code].unit,
          percentComplete: null,
        });
      }
    });

    const metricsWithData: Array<{
      code: string;
      displayName: string;
      latestValue: number;
      unit: string | null;
      dataPoints: number;
      latestPeriod: string | null;
      earliestPeriod: string | null;
    }> = [];

    const metricStats: Record<string, { count: number; periods: string[] }> = {};
    factsData.forEach((fact: any) => {
      const code = fact.metric_code;
      if (!metricStats[code]) {
        metricStats[code] = { count: 0, periods: [] };
      }
      metricStats[code].count++;
      if (fact.period_end && !metricStats[code].periods.includes(fact.period_end)) {
        metricStats[code].periods.push(fact.period_end);
      }
    });

    Object.keys(latestByMetric).forEach((code) => {
      const stats = metricStats[code] || { count: 0, periods: [] };
      const sortedPeriods = stats.periods.sort();
      const kpiDef = kpiDefsData.find((k: any) => k.metric_code === code);
      const metricDef = (metrics.data || []).find((m: any) => m.code === code);

      metricsWithData.push({
        code,
        displayName: kpiDef?.display_name || metricDef?.name || code,
        latestValue: latestByMetric[code].value,
        unit: latestByMetric[code].unit || metricDef?.unit || null,
        dataPoints: stats.count,
        latestPeriod: sortedPeriods.length > 0 ? sortedPeriods[sortedPeriods.length - 1] : null,
        earliestPeriod: sortedPeriods.length > 0 ? sortedPeriods[0] : null,
      });
    });

    metricsWithData.sort((a, b) => b.dataPoints - a.dataPoints);

    return {
      portfolio: portfolio.data,
      holdings: holdingsData,
      availableMetrics: [
        ...(metrics.data || []),
        ...kpiDefsData.map((k: any) => ({ code: k.metric_code }))
      ],
      metricsWithData,
      widgets: portfolioWidgets.data || [],
      summary: {
        totalHoldings: holdingsData.length,
        activeHoldings: statusBreakdown['Active'] || 0,
        totalAUM,
        totalNAV,
        sectorBreakdown,
        statusBreakdown,
      },
      kpiSnapshot,
      recentActions: recentActions.data || [],
    };
  }

  /**
   * Build system prompt for Claude
   */
  private buildSystemPrompt(context: any): string {
    const formatCurrency = (n: number) => n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `$${(n / 1_000).toFixed(0)}K`
        : `$${n}`;

    const sectorSummary = Object.entries(context.summary.sectorBreakdown || {})
      .sort((a: any, b: any) => b[1].funds - a[1].funds)
      .slice(0, 5)
      .map(([sector, data]: [string, any]) => `  • ${sector}: ${data.count} holdings, ${formatCurrency(data.funds)}`)
      .join('\n');

    const kpiSummary = context.kpiSnapshot
      .slice(0, 8)
      .map((kpi: any) => {
        const value = kpi.latestValue !== null
          ? `${kpi.latestValue.toLocaleString()}${kpi.unit ? ' ' + kpi.unit : ''}`
          : 'No data';
        const target = kpi.target ? ` / target: ${kpi.target.toLocaleString()}` : '';
        const progress = kpi.percentComplete !== null ? ` (${kpi.percentComplete}%)` : '';
        return `  • ${kpi.displayName}: ${value}${target}${progress}`;
      })
      .join('\n');

    const recentActionsSummary = context.recentActions
      .slice(0, 5)
      .map((a: any) => `  • ${a.action_type} ${a.entity_type}: ${a.ai_reasoning || 'No description'}`)
      .join('\n');

    const metricsWithDataSummary = (context.metricsWithData || [])
      .slice(0, 15)
      .map((m: any) => {
        const valueStr = m.latestValue !== null && m.latestValue !== undefined
          ? `${m.latestValue.toLocaleString()}${m.unit ? ' ' + m.unit : ''}`
          : 'No recent value';
        const dateRange = m.earliestPeriod && m.latestPeriod && m.earliestPeriod !== m.latestPeriod
          ? ` (${m.earliestPeriod} to ${m.latestPeriod})`
          : m.latestPeriod ? ` (as of ${m.latestPeriod})` : '';
        return `  • ${m.code}: ${m.displayName} = ${valueStr}, ${m.dataPoints} data points${dateRange}`;
      })
      .join('\n');

    return `You are Ben, a friendly AI portfolio management assistant and data visualization expert. You help users manage their impact investment portfolio and create compelling visualizations.

⚠️ CRITICAL: You MUST use function calls to display visualizations. NEVER use markdown images, placeholders, or text descriptions as substitutes for actual widget displays. When users ask to see/show/display something, call the appropriate function (display_widget, create_portfolio_widget, etc).

=== PORTFOLIO OVERVIEW ===
${context.portfolio?.name || 'Unnamed Portfolio'}
${context.portfolio?.description ? `Description: ${context.portfolio.description}` : ''}

Summary Stats:
- Total Holdings: ${context.summary.totalHoldings} (${context.summary.activeHoldings} active)
- Total AUM: ${formatCurrency(context.summary.totalAUM)}
${context.summary.totalNAV > 0 ? `- Total NAV: ${formatCurrency(context.summary.totalNAV)}` : ''}

=== METRICS WITH DATA (Use these exact codes for charts/trends) ===
${metricsWithDataSummary || 'No metric data yet. Upload reports or add metrics to holdings first.'}
${(context.metricsWithData || []).length > 15 ? `... and ${context.metricsWithData.length - 15} more metrics` : ''}

=== KPI PERFORMANCE (Current vs Targets) ===
${kpiSummary || 'No KPIs tracked yet'}

=== SECTOR BREAKDOWN ===
${sectorSummary || 'No holdings yet'}

=== HOLDINGS (${context.holdings.length} total) ===
${context.holdings.slice(0, 15).map((h: any) => `• ${h.name} (ID: ${h.id}) - ${h.sector || 'N/A'}, ${h.status || 'Unknown'}: ${formatCurrency(h.funds_allocated || 0)}`).join('\n')}
${context.holdings.length > 15 ? `... and ${context.holdings.length - 15} more` : ''}

=== EXISTING WIDGETS (${context.widgets.length} total) ===
${context.widgets.length > 0
  ? context.widgets.slice(0, 15).map((w: any) => `• "${w.title}" (${w.type}) - ID: ${w.id}`).join('\n')
  : 'No widgets created yet'}
${context.widgets.length > 15 ? `... and ${context.widgets.length - 15} more` : ''}

${context.recentActions.length > 0 ? `=== RECENT CHANGES (Last 7 days) ===
${recentActionsSummary}
` : ''}

=== CAPABILITIES ===
• Manage holdings (add/update/remove)
• Add metric facts to holdings
• Create visualizations (portfolio & holding level)
• Search/filter holdings, compare metrics, get trends
• Generate detailed reports about specific holdings/charities with inline charts
• Generate custom reports with user-specified metrics and chart types
• Save report templates for reuse
• Answer questions using the data above

=== VISUALIZATION TOOLS ===

**To show EXISTING widget**: display_widget(widget_id) - IDs are in EXISTING WIDGETS above
**To CREATE new widget**: create_portfolio_widget(type, title, config)
**For custom charts**: get_chart_data → generate_d3_chart (use get_chart_data first!)

Widget Types & Required Config:
• kpi_trend: {"metric_code": "X", "period": {"window": "12m"}}
• radial_progress: {"rings": [{"metric_code": "X", "target": N}]}
• people_grid_auto: {"metric_code": "X", "perUnit": 100, "mode": "sum"}
• holdings_pie_auto: {} (auto-fetches holdings, no metric needed)
• emissions_bar: {"metric_code": "X"}

=== VISUALIZATION BEST PRACTICES ===

**Chart Type Selection:**
• Bar: Compare categories (sectors, holdings, countries) - best for 3-15 items
• Line: Show trends over time - use for metric_trend data
• Area: Cumulative trends - emphasizes total volume
• Pie/Donut: Show proportions - ONLY for ≤6 categories
• Scatter: Correlations between two metrics

**When to Use Each:**
• "breakdown by sector" → pie (≤6) or bar (>6)
• "trend over time" → line
• "compare holdings" → bar
• "allocation" → donut
• "progress toward goal" → radial_progress widget

**Color Guidelines:**
• Single metric: Use primary brand color (#3b82f6)
• Comparisons: Use provided color palette from get_chart_data
• Positive metrics: Green (#10b981)
• Warnings/attention: Amber (#f59e0b)

=== CRITICAL RULES ===

1. **NEVER use markdown images (![...](...))** - This is STRICTLY FORBIDDEN. The chart widget displays automatically.
2. **NEVER list data as bullet points** - When a chart is generated, do NOT list the data points in your response. The chart shows the data visually.
3. **Charts auto-generate** - When you call get_chart_data, the chart is AUTOMATICALLY created and displayed. You do NOT need to call generate_d3_chart separately.
4. **Keep responses SHORT after charts** - When chart_generated:true is in the tool result, just say something brief like "Here's the trend chart" - the visualization will appear automatically below your message.
5. **Widget IDs are in context** - Don't call list_widgets to find them
6. **New widgets are PREVIEWS** - Tell users to click "Save to Dashboard" if they want to keep it
7. **ONLY use metric codes from METRICS WITH DATA section** - These are the ONLY metrics that have data. If a user asks for a metric not listed there, tell them what metrics ARE available instead.

=== HANDLING CHART REQUESTS ===

When a user asks for a chart/graph/visualization:
1. Check METRICS WITH DATA for the relevant metric code
2. Call get_chart_data with the appropriate data_type and metric_code
3. The chart widget is created AUTOMATICALLY - you will see chart_generated:true in the response
4. Your text response should be BRIEF - just acknowledge the chart. Example: "Here's the jobs trend chart showing growth over time."
5. Do NOT list the data points, do NOT use markdown images, do NOT describe what the chart looks like

=== WHAT TO DO / NOT DO ===

WRONG (do NOT do this):
"Here is the trend:
- 2022-09-30: 18 jobs
- 2022-12-31: 22 jobs
![Chart](sandbox:/path)"

CORRECT (do this):
"Here's the jobs created trend chart."
(The chart widget appears automatically below)

=== EXAMPLES ===

User: "Show my holdings breakdown by sector"
→ Call: get_chart_data(data_type="holdings_by_sector")
→ Response: "Here's your holdings breakdown by sector."

User: "Chart of jobs created trend"
→ Check METRICS WITH DATA for jobs-related code (e.g., JOBS_CREATED, JOBS_FTE)
→ Call: get_chart_data(data_type="metric_trend", metric_code="JOBS_CREATED")
→ Response: "Here's the jobs created trend over time."

User: "Compare carbon emissions across holdings"
→ Call: get_chart_data(data_type="metric_comparison", metric_code="CO2_AVOIDED")
→ Response: "Here's how carbon emissions compare across your holdings."

User: "Show portfolio allocation"
→ Call: get_chart_data(data_type="allocation_breakdown")
→ Response: "Here's your portfolio allocation breakdown."

User: "Show the KPI Progress widget"
→ Find ID in EXISTING WIDGETS, call display_widget(widget_id)

User: "Show me jobs data" (when no jobs metric exists)
→ "I don't see jobs data in this portfolio. The metrics I have are: [list from METRICS WITH DATA]. Would you like to see one of these instead?"

User: "Write a report about [holding name]"
→ Find holding ID in HOLDINGS section
→ Call: generate_holding_report(holding_id="...")
→ Write a flowing narrative report using the returned data. Charts appear inline automatically.
→ Include: overview, charity info (if linked), metric analysis, and forward outlook.
→ Do NOT list raw data as bullet points — weave numbers naturally into prose.

User: "Generate a report for [charity name]"
→ Same as above — find the holding linked to that charity and call generate_holding_report

User: "Generate a report with bar charts for JOBS_CREATED and line charts for CO2_AVOIDED"
→ Call: generate_holding_report or generate_custom_report with chart_preferences parameter
→ Example: generate_holding_report(holding_id="...", chart_preferences=[{metric_code:"JOBS_CREATED",chart_type:"bar"},{metric_code:"CO2_AVOIDED",chart_type:"line"}])

User: "Create a portfolio report showing only financial and impact sections"
→ Call: generate_custom_report(scope="portfolio", include_sections=["financials","impact"])

User: "Generate a sector report for Education"
→ Call: generate_custom_report(scope="sector", sector="Education")

User: "Save this report configuration for reuse"
→ Call: save_report_template(name="...", scope="...", config={...})

User: "What report templates do I have?"
→ Call: list_report_templates()

=== REPORT CUSTOMIZATION ===

**generate_holding_report** and **generate_custom_report** support:
- metric_codes: Array of specific metrics to include (e.g., ["JOBS_CREATED", "CO2_AVOIDED"])
- chart_preferences: Array of {metric_code, chart_type} to customize visualization per metric
- include_sections: Array of sections ["overview", "financials", "impact", "trends"]
- time_range: "3m" | "6m" | "12m" | "ytd" | "all"

Chart type options: "line", "bar", "area", "pie", "gauge"

**generate_custom_report** also supports:
- scope: "portfolio" (full portfolio), "holding" (single holding), "sector" (sector analysis)
- title: Custom report title

${this.moduleSystemPrompt ? `
=== ENABLED CAPABILITIES ===
${this.moduleSystemPrompt}
` : ''}
=== BEHAVIOR ===
• Be concise - especially after generating charts
• Use the data above to answer questions directly
• Create visualizations when asked
• Ask for confirmation on deletes
• When a metric doesn't exist, suggest available alternatives`;
  }
}
