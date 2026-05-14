// @ts-nocheck - Supabase generated types are incorrect for this file
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from './ai-action-executor';
import {
  ModuleId,
  filterToolsForOrg,
  getOrgEnabledModules,
  getSystemPromptForModules,
} from './modules';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import type { AIProvider } from '@/lib/ai/provider';
import type { AIContentBlock, ToolDefinition } from '@/lib/ai/types';

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
  initiatedBy?: 'ai' | 'user' | 'import' | 'system';
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
          enum: ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'],
          description: 'Milestone status',
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
        contribution_type: {
          type: 'string',
          enum: ['cash', 'check', 'credit_card', 'wire', 'ach', 'stock', 'crypto', 'real_estate', 'in_kind', 'other'],
          description: 'Type of contribution (default: cash)',
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
          enum: ['major', 'leadership', 'sustainer', 'supporter'],
          description: 'Filter by giving tier',
        },
        recency_status: {
          type: 'string',
          enum: ['active', 'lapsed', 'inactive'],
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
        grant_id: { type: 'string', description: 'UUID of the grant_details record' },
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

/**
 * AI Assistant for portfolio management
 * Uses the configured provider/model for conversation and function calling
 *
 * Supports modular tool filtering - only tools from enabled modules are available.
 * When orgId is provided, tools are filtered based on the organization's enabled modules.
 */
export class PortfolioAssistant {
  private provider: AIProvider;
  private aiInstructions: string | null = null;
  private supabase: ReturnType<typeof createClient>;
  private enabledModules: ModuleId[] = ['core'];
  private moduleSystemPrompt: string = '';

  constructor(supabaseClient: ReturnType<typeof createClient>, _apiKey?: string) {
    this.provider = createAIProvider();
    this.supabase = supabaseClient;
  }

  /**
   * Initialize assistant with organization context for module filtering
   * Call this before chat() when you want module-based tool filtering
   */
  async initializeForOrg(orgId: string): Promise<void> {
    const [enabledModules, orgRes] = await Promise.all([
      getOrgEnabledModules(this.supabase, orgId),
      this.supabase
        .from('organizations')
        .select('ai_instructions')
        .eq('id', orgId)
        .single(),
    ]);
    this.enabledModules = enabledModules;
    this.moduleSystemPrompt = getSystemPromptForModules(this.enabledModules);
    this.aiInstructions = orgRes.data?.ai_instructions ?? null;
  }

  /**
   * Get tools filtered by enabled modules
   */
  private getFilteredTools(): ToolDefinition[] {
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
    memberRole?: string;
  }) {
    const { portfolioId, userId, sessionId, message, orgId, conversationHistory = [], memberRole } = params;

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

    // Build mutable message history for multi-turn tool execution
    const currentMessages: AIMessage[] = [
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Multi-turn tool execution loop — continues until end_turn or max 5 iterations
    const actions: AIAction[] = [];
    const allToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
    const allToolResults: Array<{ tool_use_id: string; content: string }> = [];
    let textContent = '';
    const batchId = crypto.randomUUID();
    let sequenceCounter = 0;
    const MAX_TURNS = 5;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastModel = AI_MODELS.assistant;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.provider.createMessage({
        model: AI_MODELS.assistant,
        maxTokens: 4096,
        system: systemPrompt,
        tools: tools as unknown as ToolDefinition[],
        messages: currentMessages,
      });

      // Accumulate token usage across turns
      if (response.usage) {
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
      }
      if (response.model) lastModel = response.model;

      // Collect text from this turn
      const textBlocks = response.content.filter(
        (block): block is AIContentBlock & { type: 'text' } => block.type === 'text'
      );
      const turnText = textBlocks.map(b => b.text).join('');
      if (turnText) textContent = turnText;

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is AIContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
      );

      // No tool use or end_turn — we're done
      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') {
        break;
      }

      // Execute tools for this turn
      const turnToolResults: Array<{ tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        allToolCalls.push({
          id: toolUse.id,
          type: 'function',
          function: { name: toolUse.name, arguments: JSON.stringify(toolUse.input) },
        });
        try {
          const result = await this.executeTool(
            toolUse.name,
            toolUse.input as Record<string, any>,
            portfolioId,
            userId,
            sessionId,
            batchId,
            sequenceCounter++,
            message,
            memberRole
          );
          if (result.action) actions.push(result.action);
          if (result.additionalActions) actions.push(...result.additionalActions);
          const toolResult = { tool_use_id: toolUse.id, content: JSON.stringify(result.output) };
          turnToolResults.push(toolResult);
          allToolResults.push(toolResult);
        } catch (error) {
          const toolResult = { tool_use_id: toolUse.id, content: JSON.stringify({ error: (error as Error).message }) };
          turnToolResults.push(toolResult);
          allToolResults.push(toolResult);
        }
      }

      // Extend message history for next turn
      currentMessages.push(
        { role: 'assistant' as const, content: response.content },
        {
          role: 'user' as const,
          content: turnToolResults.map(tr => ({
            type: 'tool_result' as const,
            tool_use_id: tr.tool_use_id,
            content: tr.content,
          })) as AIContentBlock[],
        }
      );
    }

    return {
      message: textContent,
      actions,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: lastModel },
    };
  }

  /**
   * Process a user message and stream the AI response as NDJSON events.
   * Mirrors the multi-turn tool-calling loop in chat() but yields text deltas
   * to the client as they arrive so users see partial responses immediately.
   *
   * Event types yielded (each line is a JSON string + '\n'):
   *   { type: 'text_delta', text: string }
   *   { type: 'status', text: string }
   *   { type: 'done', message, actions, toolResults, usage }
   */
  async *chatStream(params: {
    portfolioId: string;
    userId: string;
    sessionId: string;
    message: string;
    orgId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    memberRole?: string;
  }): AsyncGenerator<string> {
    const { portfolioId, userId, sessionId, message, orgId, conversationHistory = [], memberRole } = params;

    if (orgId) await this.initializeForOrg(orgId);
    const tools = this.getFilteredTools();
    const context = await this.getPortfolioContext(portfolioId);
    const systemPrompt = this.buildSystemPrompt(context);

    const currentMessages: AIMessage[] = [
      ...conversationHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      { role: 'user' as const, content: message },
    ];

    const actions: AIAction[] = [];
    let textContent = '';
    const batchId = crypto.randomUUID();
    let sequenceCounter = 0;
    const MAX_TURNS = 5;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastModel = AI_MODELS.assistant;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let turnTextContent = '';
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, any> }> = [];
      let stopReason: string | null = null;

      // Use createStream so text tokens arrive as they're generated
      const stream = this.provider.createStream({
        model: AI_MODELS.assistant,
        maxTokens: 4096,
        system: systemPrompt,
        tools: tools as unknown as ToolDefinition[],
        messages: currentMessages,
      });

      let currentToolId: string | null = null;
      let currentToolName: string | null = null;
      let currentToolInputJson = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_start') {
          if (chunk.blockType === 'tool_use') {
            currentToolId = chunk.id ?? null;
            currentToolName = chunk.name ?? null;
            currentToolInputJson = '';
            // Yield status update when entering tool calling
            if (actions.length === 0 && toolUseBlocks.length === 0) {
              yield JSON.stringify({ type: 'status', text: 'Calling tools…' }) + '\n';
            }
          }
        } else if (chunk.type === 'text_delta') {
          turnTextContent += chunk.text;
          // Stream text deltas to client immediately
          yield JSON.stringify({ type: 'text_delta', text: chunk.text }) + '\n';
        } else if (chunk.type === 'tool_input_delta') {
          currentToolInputJson += chunk.partialJson;
        } else if (chunk.type === 'content_block_stop') {
          if (currentToolId && currentToolName) {
            let input: Record<string, any> = {};
            try { input = JSON.parse(currentToolInputJson); } catch {}
            toolUseBlocks.push({ id: currentToolId, name: currentToolName, input });
            currentToolId = null;
            currentToolName = null;
            currentToolInputJson = '';
          }
        } else if (chunk.type === 'message_stop') {
          stopReason = chunk.stopReason;
        }
      }

      if (turnTextContent) textContent = turnTextContent;

      // No tools or not tool_use stop — done
      if (toolUseBlocks.length === 0 || stopReason !== 'tool_use') {
        break;
      }

      // Yield status before executing tools
      yield JSON.stringify({ type: 'status', text: 'Processing results…' }) + '\n';

      // Execute tools (same logic as chat())
      const turnToolResults: Array<{ tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await this.executeTool(
            toolUse.name,
            toolUse.input,
            portfolioId,
            userId,
            sessionId,
            batchId,
            sequenceCounter++,
            message,
            memberRole
          );
          if (result.action) actions.push(result.action);
          if (result.additionalActions) actions.push(...result.additionalActions);
          const toolContent = typeof result.output === 'string'
            ? result.output
            : JSON.stringify(result.output);
          turnToolResults.push({ tool_use_id: toolUse.id, content: toolContent });
        } catch (err) {
          turnToolResults.push({ tool_use_id: toolUse.id, content: `Error: ${err instanceof Error ? err.message : String(err)}` });
        }
      }

      // Append assistant message (with tool calls) + tool results to history
      currentMessages.push({
        role: 'assistant',
        content: [
          ...(turnTextContent ? [{ type: 'text' as const, text: turnTextContent }] : []),
          ...toolUseBlocks.map(t => ({ type: 'tool_use' as const, id: t.id, name: t.name, input: t.input })),
        ],
      });
      currentMessages.push({
        role: 'user',
        content: turnToolResults.map(r => ({ type: 'tool_result' as const, tool_use_id: r.tool_use_id, content: r.content })),
      });
    }

    // Yield the done event with all metadata
    yield JSON.stringify({
      type: 'done',
      message: textContent,
      actions,
      toolResults: [],
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: lastModel },
    }) + '\n';
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
  private readonly WRITE_TOOLS = new Set([
    'add_holding', 'update_holding', 'remove_holding',
    'add_metric_fact', 'delete_metric_fact',
    'add_widget', 'remove_widget',
    'log_contribution_received', 'generate_receipt', 'generate_acknowledgment',
    'track_filing_deadline', 'register_disqualified_person',
    'assess_qualifying_distribution', 'log_expenditure_responsibility',
  ]);

  private async executeTool(
    functionName: string,
    args: any,
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    memberRole?: string
  ): Promise<ToolResult> {
    if (this.WRITE_TOOLS.has(functionName) && memberRole === 'viewer') {
      return { error: 'Viewers cannot perform write operations. Request a role upgrade from your org admin.' } as any;
    }

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
        let holdingsQuery = this.supabase
          .from('holdings')
          .select('*')
          .eq('portfolio_id', portfolioId);
        if (args.status) {
          holdingsQuery = holdingsQuery.eq('status', args.status);
        }
        const { data } = await holdingsQuery;

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

        // display_widget is read-only — no action record needed
        return {
          action: null,
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

      // ==================== GRANT MANAGEMENT MODULE ====================
      case 'start_due_diligence': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');
        if (args.template_id) InputValidator.validateUUID(args.template_id, 'template_id');
        if (args.due_date) InputValidator.validateDateString(args.due_date, 'due_date');
        if (args.assigned_to) InputValidator.validateUUID(args.assigned_to, 'assigned_to');

        // Get or use default due diligence template
        let template;
        if (args.template_id) {
          const { data, error } = await this.supabase
            .from('workflow_templates')
            .select('*')
            .eq('id', args.template_id)
            .single();
          if (error) throw new Error(`Template not found: ${error.message}`);
          template = data;
        } else {
          // Use system default due diligence template
          const { data, error } = await this.supabase
            .from('workflow_templates')
            .select('*')
            .eq('workflow_type', 'due_diligence')
            .eq('is_system', true)
            .limit(1)
            .single();
          if (error) {
            return {
              action: null,
              output: {
                error: 'No due diligence template found. Please create one first.',
                success: false,
              },
            };
          }
          template = data;
        }

        // Get grant_id from holding
        const { data: grant, error: grantError } = await this.supabase
          .from('grant_details')
          .select('id')
          .eq('holding_id', args.holding_id)
          .maybeSingle();

        if (grantError) throw new Error(`Error finding grant: ${grantError.message}`);

        // If no grant details exist, create them
        let grantId = grant?.id;
        if (!grantId) {
          const { data: newGrant, error: createError } = await this.supabase
            .from('grant_details')
            .insert({ holding_id: args.holding_id })
            .select('id')
            .single();
          if (createError) throw new Error(`Error creating grant details: ${createError.message}`);
          grantId = newGrant.id;
        }

        // Get holding name for workflow naming
        const { data: holding } = await this.supabase
          .from('holdings')
          .select('name')
          .eq('id', args.holding_id)
          .single();

        // Create workflow instance
        const { data: workflow, error: wfError } = await this.supabase
          .from('workflow_instances')
          .insert({
            template_id: template.id,
            grant_id: grantId,
            portfolio_id: portfolioId,
            name: `Due Diligence - ${holding?.name || args.holding_id}`,
            due_date: args.due_date || null,
            started_by: userId,
            status: 'active',
          })
          .select()
          .single();

        if (wfError) throw new Error(`Error creating workflow: ${wfError.message}`);

        // Calculate task due dates based on estimated days
        const calculateTaskDueDate = (workflowDueDate: string | null, estimatedDays: number, stepIndex: number): string | null => {
          if (!workflowDueDate) return null;
          const dueDate = new Date(workflowDueDate);
          // Work backwards from due date, earlier steps get earlier dates
          const totalSteps = template.steps.length;
          const daysBeforeDue = Math.max(0, ((totalSteps - stepIndex) / totalSteps) * 14); // Spread over 2 weeks before due
          dueDate.setDate(dueDate.getDate() - daysBeforeDue);
          return dueDate.toISOString().split('T')[0];
        };

        // Create tasks from template steps
        const tasks = template.steps.map((step: any, index: number) => ({
          workflow_id: workflow.id,
          step_id: step.id,
          name: step.name,
          description: step.description,
          sequence_order: step.order || index + 1,
          is_required: step.required !== false,
          assigned_to: args.assigned_to || null,
          due_date: calculateTaskDueDate(args.due_date, step.estimated_days || 1, index),
          status: 'pending',
        }));

        const { error: taskError } = await this.supabase
          .from('workflow_tasks')
          .insert(tasks);

        if (taskError) throw new Error(`Error creating tasks: ${taskError.message}`);

        return {
          action: null,
          output: {
            success: true,
            workflow_id: workflow.id,
            workflow_name: workflow.name,
            template_used: template.name,
            tasks_created: tasks.length,
            due_date: args.due_date || 'Not set',
            message: `Started due diligence workflow "${workflow.name}" with ${tasks.length} tasks`,
          },
        };
      }

      case 'get_workflow_status': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');
        if (args.workflow_id) InputValidator.validateUUID(args.workflow_id, 'workflow_id');

        // Get grant_id from holding
        const { data: grant } = await this.supabase
          .from('grant_details')
          .select('id')
          .eq('holding_id', args.holding_id)
          .maybeSingle();

        if (!grant) {
          return {
            action: null,
            output: {
              workflows: [],
              message: 'No grant details found for this holding',
            },
          };
        }

        // Build workflow query
        let workflowQuery = this.supabase
          .from('workflow_instances')
          .select(`
            id,
            name,
            status,
            due_date,
            started_at,
            completed_at,
            notes,
            workflow_templates(name, workflow_type),
            workflow_tasks(
              id,
              name,
              description,
              status,
              is_required,
              due_date,
              outcome,
              outcome_notes,
              completed_at,
              sequence_order
            )
          `)
          .eq('grant_id', grant.id)
          .order('started_at', { ascending: false });

        if (args.workflow_id) {
          workflowQuery = workflowQuery.eq('id', args.workflow_id);
        }

        if (!args.include_completed) {
          workflowQuery = workflowQuery.eq('status', 'active');
        }

        const { data: workflows, error } = await workflowQuery;

        if (error) throw new Error(`Error fetching workflows: ${error.message}`);

        // Calculate completion stats for each workflow
        const workflowsWithStats = (workflows || []).map((wf: any) => {
          const tasks = wf.workflow_tasks || [];
          const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
          const requiredTasks = tasks.filter((t: any) => t.is_required).length;
          const completedRequired = tasks.filter((t: any) => t.is_required && t.status === 'completed').length;

          return {
            ...wf,
            template_name: wf.workflow_templates?.name,
            workflow_type: wf.workflow_templates?.workflow_type,
            tasks_total: tasks.length,
            tasks_completed: completedTasks,
            tasks_pending: tasks.filter((t: any) => t.status === 'pending').length,
            tasks_in_progress: tasks.filter((t: any) => t.status === 'in_progress').length,
            required_tasks: requiredTasks,
            required_completed: completedRequired,
            completion_percentage: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
            workflow_tasks: tasks.sort((a: any, b: any) => a.sequence_order - b.sequence_order),
          };
        });

        return {
          action: null,
          output: {
            workflows: workflowsWithStats,
            total_workflows: workflowsWithStats.length,
          },
        };
      }

      case 'complete_workflow_task': {
        InputValidator.validateUUID(args.task_id, 'task_id');
        InputValidator.validateEnum(args.outcome, 'outcome', ['pass', 'fail', 'conditional', 'n/a'] as const);

        // Update the task
        const { data: task, error } = await this.supabase
          .from('workflow_tasks')
          .update({
            status: 'completed',
            outcome: args.outcome,
            outcome_notes: args.notes || null,
            completed_at: new Date().toISOString(),
            completed_by: userId,
          })
          .eq('id', args.task_id)
          .select('*, workflow_instances(id, name, grant_id)')
          .single();

        if (error) throw new Error(`Error completing task: ${error.message}`);

        // Check if all required tasks are completed
        const { data: remainingTasks } = await this.supabase
          .from('workflow_tasks')
          .select('id, status, is_required')
          .eq('workflow_id', (task as any).workflow_instances.id)
          .eq('is_required', true)
          .neq('status', 'completed');

        const allRequiredComplete = !remainingTasks || remainingTasks.length === 0;

        // If all required tasks complete, mark workflow as completed
        if (allRequiredComplete) {
          await this.supabase
            .from('workflow_instances')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', (task as any).workflow_instances.id);
        }

        return {
          action: null,
          output: {
            success: true,
            task_id: args.task_id,
            task_name: task.name,
            outcome: args.outcome,
            workflow_completed: allRequiredComplete,
            message: allRequiredComplete
              ? `Task "${task.name}" completed. All required tasks done - workflow marked as completed.`
              : `Task "${task.name}" marked as ${args.outcome}`,
          },
        };
      }

      case 'track_milestone': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');
        if (args.milestone_id) InputValidator.validateUUID(args.milestone_id, 'milestone_id');
        if (args.due_date) InputValidator.validateDateString(args.due_date, 'due_date');
        if (args.status) {
          InputValidator.validateEnum(args.status, 'status', ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'] as const);
        }

        // Get grant_id from holding
        const { data: grant, error: grantError } = await this.supabase
          .from('grant_details')
          .select('id')
          .eq('holding_id', args.holding_id)
          .maybeSingle();

        if (grantError) throw new Error(`Error finding grant: ${grantError.message}`);

        // If no grant details exist, create them
        let grantId = grant?.id;
        if (!grantId) {
          const { data: newGrant, error: createError } = await this.supabase
            .from('grant_details')
            .insert({ holding_id: args.holding_id })
            .select('id')
            .single();
          if (createError) throw new Error(`Error creating grant details: ${createError.message}`);
          grantId = newGrant.id;
        }

        if (args.milestone_id) {
          // Update existing milestone
          const updateData: any = {};
          if (args.name) updateData.milestone_name = args.name;
          if (args.description) updateData.description = args.description;
          if (args.due_date) updateData.due_date = args.due_date;
          if (args.status) updateData.status = args.status;
          if (args.notes) updateData.notes = args.notes;
          if (args.status === 'completed') {
            updateData.completed_date = new Date().toISOString().split('T')[0];
          }

          const { data: milestone, error } = await this.supabase
            .from('grant_milestones')
            .update(updateData)
            .eq('id', args.milestone_id)
            .select()
            .single();

          if (error) throw new Error(`Error updating milestone: ${error.message}`);

          return {
            action: null,
            output: {
              success: true,
              action: 'updated',
              milestone: milestone,
              message: `Milestone "${milestone.milestone_name}" updated`,
            },
          };
        } else {
          // Create new milestone
          if (!args.name) {
            throw new ValidationError('name is required when creating a new milestone');
          }

          const { data: milestone, error } = await this.supabase
            .from('grant_milestones')
            .insert({
              grant_id: grantId,
              milestone_name: args.name,
              description: args.description || null,
              due_date: args.due_date || null,
              status: args.status || 'pending',
              notes: args.notes || null,
            })
            .select()
            .single();

          if (error) throw new Error(`Error creating milestone: ${error.message}`);

          return {
            action: null,
            output: {
              success: true,
              action: 'created',
              milestone: milestone,
              message: `New milestone "${args.name}" created`,
            },
          };
        }
      }

      case 'schedule_reminder': {
        InputValidator.validateUUID(args.portfolio_id, 'portfolio_id');
        if (args.holding_id) InputValidator.validateUUID(args.holding_id, 'holding_id');
        InputValidator.validateDateString(args.due_date, 'due_date');
        if (args.reminder_type) {
          InputValidator.validateEnum(args.reminder_type, 'reminder_type', [
            'report_due', 'milestone_due', 'payment_due', 'renewal', 'follow_up', 'site_visit', 'custom'
          ] as const);
        }

        // Calculate reminder times based on days_before
        const remindDaysBefore = args.remind_days_before || [7, 3, 1];
        const dueDate = new Date(args.due_date);
        const remindAt = remindDaysBefore.map((days: number) => {
          const reminderDate = new Date(dueDate);
          reminderDate.setDate(reminderDate.getDate() - days);
          reminderDate.setHours(9, 0, 0, 0); // 9 AM
          return reminderDate.toISOString();
        });

        // Get entity info if holding_id provided
        let entityType = null;
        let entityId = null;
        if (args.holding_id) {
          const { data: grant } = await this.supabase
            .from('grant_details')
            .select('id')
            .eq('holding_id', args.holding_id)
            .maybeSingle();
          if (grant) {
            entityType = 'grant';
            entityId = grant.id;
          }
        }

        const { data: reminder, error } = await this.supabase
          .from('reminders')
          .insert({
            portfolio_id: args.portfolio_id,
            reminder_type: args.reminder_type || 'custom',
            entity_type: entityType,
            entity_id: entityId,
            title: args.title,
            description: args.description || null,
            due_date: args.due_date,
            remind_at: remindAt,
            notify_users: [userId],
            created_by: userId,
            status: 'pending',
          })
          .select()
          .single();

        if (error) throw new Error(`Error creating reminder: ${error.message}`);

        return {
          action: null,
          output: {
            success: true,
            reminder_id: reminder.id,
            title: args.title,
            due_date: args.due_date,
            reminder_dates: remindAt.map((r: string) => r.split('T')[0]),
            message: `Reminder "${args.title}" scheduled for ${args.due_date} with ${remindAt.length} notifications`,
          },
        };
      }

      case 'get_upcoming_deadlines': {
        InputValidator.validateUUID(args.portfolio_id, 'portfolio_id');
        const daysAhead = args.days_ahead || 30;

        // Use the database function for comprehensive deadline view
        const { data: deadlines, error } = await this.supabase
          .rpc('get_upcoming_deadlines', {
            p_portfolio_id: args.portfolio_id,
            p_days_ahead: daysAhead,
          });

        if (error) throw new Error(`Error fetching deadlines: ${error.message}`);

        // Filter by types if specified
        let filteredDeadlines = deadlines || [];
        if (args.include_types && args.include_types.length > 0) {
          const typeMapping: Record<string, string[]> = {
            reports: ['report'],
            milestones: ['milestone'],
            payments: ['payment'],
            renewals: ['renewal'],
            tasks: ['workflow_task'],
          };
          const allowedTypes = args.include_types.flatMap((t: string) => typeMapping[t] || [t]);
          filteredDeadlines = filteredDeadlines.filter((d: any) => allowedTypes.includes(d.deadline_type));
        }

        // Group by priority
        const overdue = filteredDeadlines.filter((d: any) => d.priority === 'overdue');
        const urgent = filteredDeadlines.filter((d: any) => d.priority === 'urgent');
        const normal = filteredDeadlines.filter((d: any) => d.priority === 'normal');

        return {
          action: null,
          output: {
            days_ahead: daysAhead,
            total_deadlines: filteredDeadlines.length,
            overdue: {
              count: overdue.length,
              items: overdue,
            },
            urgent: {
              count: urgent.length,
              items: urgent,
            },
            upcoming: {
              count: normal.length,
              items: normal,
            },
            all_deadlines: filteredDeadlines,
          },
        };
      }

      case 'log_grant_communication': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');
        InputValidator.validateEnum(args.direction, 'direction', ['inbound', 'outbound'] as const);
        InputValidator.validateEnum(args.comm_type, 'comm_type', [
          'email', 'phone', 'meeting', 'site_visit', 'letter', 'portal_message', 'other'
        ] as const);
        if (args.follow_up_date) InputValidator.validateDateString(args.follow_up_date, 'follow_up_date');

        // Get grant_id from holding
        const { data: grant, error: grantError } = await this.supabase
          .from('grant_details')
          .select('id')
          .eq('holding_id', args.holding_id)
          .maybeSingle();

        if (grantError) throw new Error(`Error finding grant: ${grantError.message}`);

        // If no grant details exist, create them
        let grantId = grant?.id;
        if (!grantId) {
          const { data: newGrant, error: createError } = await this.supabase
            .from('grant_details')
            .insert({ holding_id: args.holding_id })
            .select('id')
            .single();
          if (createError) throw new Error(`Error creating grant details: ${createError.message}`);
          grantId = newGrant.id;
        }

        const { data: communication, error } = await this.supabase
          .from('grant_communications')
          .insert({
            grant_id: grantId,
            direction: args.direction,
            comm_type: args.comm_type,
            subject: args.subject || null,
            summary: args.summary,
            contact_name: args.contact_name || null,
            contact_email: args.contact_email || null,
            occurred_at: new Date().toISOString(),
            logged_by: userId,
            follow_up_required: args.follow_up_required || false,
            follow_up_date: args.follow_up_date || null,
            follow_up_notes: args.follow_up_notes || null,
          })
          .select()
          .single();

        if (error) throw new Error(`Error logging communication: ${error.message}`);

        // If follow-up required, create a reminder
        if (args.follow_up_required && args.follow_up_date) {
          await this.supabase
            .from('reminders')
            .insert({
              portfolio_id: portfolioId,
              reminder_type: 'follow_up',
              entity_type: 'grant_communication',
              entity_id: communication.id,
              title: `Follow up: ${args.subject || 'Communication with grantee'}`,
              description: args.follow_up_notes || `Follow up on ${args.comm_type} from ${new Date().toLocaleDateString()}`,
              due_date: args.follow_up_date,
              remind_at: [new Date(args.follow_up_date).toISOString()],
              notify_users: [userId],
              created_by: userId,
              status: 'pending',
            });
        }

        return {
          action: null,
          output: {
            success: true,
            communication_id: communication.id,
            type: args.comm_type,
            direction: args.direction,
            follow_up_scheduled: args.follow_up_required && args.follow_up_date ? args.follow_up_date : null,
            message: `${args.direction === 'inbound' ? 'Incoming' : 'Outgoing'} ${args.comm_type} logged successfully`,
          },
        };
      }

      case 'get_grant_health': {
        InputValidator.validateUUID(args.portfolio_id, 'portfolio_id');
        if (args.holding_id) InputValidator.validateUUID(args.holding_id, 'holding_id');

        // Use the v_grant_health view
        let query = this.supabase
          .from('v_grant_health')
          .select('*')
          .eq('portfolio_id', args.portfolio_id);

        if (args.holding_id) {
          query = query.eq('holding_id', args.holding_id);
        }

        const { data: healthData, error } = await query;

        if (error) throw new Error(`Error fetching grant health: ${error.message}`);

        if (!healthData || healthData.length === 0) {
          return {
            action: null,
            output: {
              grants: [],
              message: 'No grants found in this portfolio',
            },
          };
        }

        // Calculate portfolio-level stats
        const highRisk = healthData.filter((g: any) => g.risk_level === 'high');
        const mediumRisk = healthData.filter((g: any) => g.risk_level === 'medium');
        const avgHealthScore = healthData.reduce((sum: number, g: any) => sum + (g.health_score || 0), 0) / healthData.length;
        const totalDisbursed = healthData.reduce((sum: number, g: any) => sum + (g.total_disbursed || 0), 0);
        const totalScheduled = healthData.reduce((sum: number, g: any) => sum + (g.total_scheduled || 0), 0);

        const result: any = {
          summary: {
            total_grants: healthData.length,
            average_health_score: Math.round(avgHealthScore),
            high_risk_count: highRisk.length,
            medium_risk_count: mediumRisk.length,
            low_risk_count: healthData.length - highRisk.length - mediumRisk.length,
            total_disbursed: totalDisbursed,
            total_scheduled: totalScheduled,
            disbursement_rate: totalScheduled > 0 ? Math.round((totalDisbursed / totalScheduled) * 100) : 0,
          },
        };

        if (args.include_details !== false) {
          result.grants = healthData.map((g: any) => ({
            holding_id: g.holding_id,
            grant_name: g.grant_name,
            grant_type: g.grant_type,
            health_score: g.health_score,
            risk_level: g.risk_level,
            funds_allocated: g.funds_allocated,
            total_disbursed: g.total_disbursed,
            payments_pending: g.payments_pending,
            milestones: {
              total: g.total_milestones,
              completed: g.milestones_completed,
              overdue: g.milestones_overdue,
            },
            reports: {
              total: g.total_reports,
              submitted: g.reports_submitted,
              overdue: g.reports_overdue,
            },
            active_workflows: g.active_workflows,
            workflow_tasks_pending: g.workflow_tasks_pending,
            period_start: g.grant_period_start,
            period_end: g.grant_period_end,
          }));

          // Highlight attention needed
          result.attention_needed = [];
          if (highRisk.length > 0) {
            result.attention_needed.push({
              type: 'high_risk_grants',
              count: highRisk.length,
              grants: highRisk.map((g: any) => g.grant_name),
            });
          }
          const overdueReports = healthData.filter((g: any) => g.reports_overdue > 0);
          if (overdueReports.length > 0) {
            result.attention_needed.push({
              type: 'overdue_reports',
              count: overdueReports.reduce((sum: number, g: any) => sum + g.reports_overdue, 0),
              grants: overdueReports.map((g: any) => g.grant_name),
            });
          }
          const overdueMilestones = healthData.filter((g: any) => g.milestones_overdue > 0);
          if (overdueMilestones.length > 0) {
            result.attention_needed.push({
              type: 'overdue_milestones',
              count: overdueMilestones.reduce((sum: number, g: any) => sum + g.milestones_overdue, 0),
              grants: overdueMilestones.map((g: any) => g.grant_name),
            });
          }
        }

        return { action: null, output: result };
      }

      case 'record_grant_payment': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');
        if (args.payment_id) InputValidator.validateUUID(args.payment_id, 'payment_id');
        if (args.amount) InputValidator.validateNumber(args.amount, 'amount', { min: 0 });
        if (args.scheduled_date) InputValidator.validateDateString(args.scheduled_date, 'scheduled_date');
        if (args.actual_date) InputValidator.validateDateString(args.actual_date, 'actual_date');
        if (args.status) {
          InputValidator.validateEnum(args.status, 'status', [
            'scheduled', 'approved', 'processing', 'completed', 'cancelled'
          ] as const);
        }
        if (args.payment_method) {
          InputValidator.validateEnum(args.payment_method, 'payment_method', ['check', 'wire', 'ach'] as const);
        }

        // Get grant_id from holding
        const { data: grant, error: grantError } = await this.supabase
          .from('grant_details')
          .select('id')
          .eq('holding_id', args.holding_id)
          .maybeSingle();

        if (grantError) throw new Error(`Error finding grant: ${grantError.message}`);

        // If no grant details exist, create them
        let grantId = grant?.id;
        if (!grantId) {
          const { data: newGrant, error: createError } = await this.supabase
            .from('grant_details')
            .insert({ holding_id: args.holding_id })
            .select('id')
            .single();
          if (createError) throw new Error(`Error creating grant details: ${createError.message}`);
          grantId = newGrant.id;
        }

        if (args.payment_id) {
          // Update existing payment
          const updateData: any = {};
          if (args.amount !== undefined) updateData.amount = args.amount;
          if (args.scheduled_date) updateData.scheduled_date = args.scheduled_date;
          if (args.actual_date) updateData.actual_date = args.actual_date;
          if (args.status) updateData.status = args.status;
          if (args.payment_method) updateData.payment_method = args.payment_method;
          if (args.notes) updateData.notes = args.notes;

          // If marking as approved, record approval info
          if (args.status === 'approved') {
            updateData.approved_by = userId;
            updateData.approved_at = new Date().toISOString();
          }

          const { data: payment, error } = await this.supabase
            .from('grant_payments')
            .update(updateData)
            .eq('id', args.payment_id)
            .select()
            .single();

          if (error) throw new Error(`Error updating payment: ${error.message}`);

          return {
            action: null,
            output: {
              success: true,
              action: 'updated',
              payment: payment,
              message: `Payment #${payment.payment_number} updated to ${args.status || 'current status'}`,
            },
          };
        } else {
          // Create new payment - determine payment number
          const { data: existingPayments } = await this.supabase
            .from('grant_payments')
            .select('payment_number')
            .eq('grant_id', grantId)
            .order('payment_number', { ascending: false })
            .limit(1);

          const nextPaymentNumber = ((existingPayments || [])[0]?.payment_number || 0) + 1;

          if (!args.amount) {
            throw new ValidationError('amount is required when creating a new payment');
          }

          const { data: payment, error } = await this.supabase
            .from('grant_payments')
            .insert({
              grant_id: grantId,
              payment_number: nextPaymentNumber,
              amount: args.amount,
              scheduled_date: args.scheduled_date || null,
              actual_date: args.actual_date || null,
              status: args.status || 'scheduled',
              payment_method: args.payment_method || null,
              notes: args.notes || null,
            })
            .select()
            .single();

          if (error) throw new Error(`Error creating payment: ${error.message}`);

          return {
            action: null,
            output: {
              success: true,
              action: 'created',
              payment: payment,
              message: `Payment #${nextPaymentNumber} for $${args.amount.toLocaleString()} created`,
            },
          };
        }
      }

      // ==================== DONOR MANAGEMENT MODULE ====================
      case 'log_contribution_received': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        InputValidator.validateNumber(args.amount, 'amount', { min: 0.01 });
        if (args.donor_id) InputValidator.validateUUID(args.donor_id, 'donor_id');
        if (args.contribution_date) InputValidator.validateDateString(args.contribution_date, 'contribution_date');
        if (args.contribution_type) {
          InputValidator.validateEnum(args.contribution_type, 'contribution_type', [
            'cash', 'check', 'credit_card', 'wire', 'ach', 'stock', 'crypto', 'real_estate', 'in_kind', 'other'
          ] as const);
        }
        if (args.donor_type) {
          InputValidator.validateEnum(args.donor_type, 'donor_type', [
            'individual', 'foundation', 'corporation', 'government', 'other'
          ] as const);
        }

        let donorId = args.donor_id;

        // Auto-create donor if not provided but name given
        if (!donorId && args.donor_name) {
          const donorType = args.donor_type || 'individual';
          const isOrg = ['foundation', 'corporation', 'government'].includes(donorType);

          // Parse name for individuals
          let firstName = null;
          let lastName = null;
          let orgName = null;

          if (isOrg) {
            orgName = args.donor_name;
          } else {
            const nameParts = args.donor_name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              firstName = nameParts.slice(0, -1).join(' ');
              lastName = nameParts[nameParts.length - 1];
            } else {
              firstName = args.donor_name;
            }
          }

          // Check for existing donor by email or name
          let existingDonor = null;
          if (args.donor_email) {
            const { data } = await this.supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('email', args.donor_email)
              .maybeSingle();
            existingDonor = data;
          }

          if (!existingDonor && !isOrg && lastName) {
            const { data } = await this.supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('first_name', firstName)
              .eq('last_name', lastName)
              .maybeSingle();
            existingDonor = data;
          }

          if (!existingDonor && isOrg && orgName) {
            const { data } = await this.supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('organization_name', orgName)
              .maybeSingle();
            existingDonor = data;
          }

          if (existingDonor) {
            donorId = existingDonor.id;
          } else {
            // Create new donor
            const { data: newDonor, error: donorError } = await this.supabase
              .from('donors')
              .insert({
                org_id: args.organization_id,
                is_organization: isOrg,
                first_name: firstName,
                last_name: lastName,
                organization_name: orgName,
                email: args.donor_email || null,
              })
              .select('id')
              .single();

            if (donorError) throw new Error(`Error creating donor: ${donorError.message}`);
            donorId = newDonor.id;
          }
        }

        // Create the contribution
        const { data: contribution, error: contribError } = await this.supabase
          .from('contributions_received')
          .insert({
            org_id: args.organization_id,
            donor_id: donorId || null,
            amount: args.amount,
            contribution_date: args.contribution_date || new Date().toISOString().split('T')[0],
            contribution_type: args.contribution_type || 'cash',
            designation: args.designation || null,
            is_restricted: args.is_restricted || false,
            quid_pro_quo_value: args.quid_pro_quo_value || 0,
            campaign: args.campaign || null,
            notes: args.notes || null,
            created_by: userId,
          })
          .select('*, donors(first_name, last_name, organization_name, is_organization)')
          .single();

        if (contribError) throw new Error(`Error creating contribution: ${contribError.message}`);

        // Auto-generate receipt for contributions >= $250
        let receiptGenerated = false;
        if (args.auto_generate_receipt && args.amount >= 250) {
          const receiptNumber = await this.supabase.rpc('generate_receipt_number', {
            p_org_id: args.organization_id,
          });

          if (receiptNumber.data) {
            await this.supabase
              .from('contributions_received')
              .update({
                receipt_number: receiptNumber.data,
                receipt_status: 'generated',
                receipt_generated_at: new Date().toISOString(),
              })
              .eq('id', contribution.id);
            receiptGenerated = true;
          }
        }

        // Build donor display name
        const donor = contribution.donors;
        const donorName = donor
          ? (!donor.is_organization
              ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
              : donor.organization_name)
          : 'Anonymous';

        return {
          action: null,
          output: {
            success: true,
            contribution_id: contribution.id,
            amount: args.amount,
            donor_id: donorId,
            donor_name: donorName,
            donor_created: !args.donor_id && donorId ? true : false,
            receipt_generated: receiptGenerated,
            message: `Logged $${args.amount.toLocaleString()} contribution from ${donorName}${receiptGenerated ? ' (receipt generated)' : ''}`,
          },
        };
      }

      case 'generate_receipt': {
        InputValidator.validateUUID(args.contribution_id, 'contribution_id');

        // Get contribution with donor and organization info
        const { data: contribution, error: contribError } = await this.supabase
          .from('contributions_received')
          .select(`
            *,
            donors(first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip),
            organizations(name, ein, website)
          `)
          .eq('id', args.contribution_id)
          .single();

        if (contribError) throw new Error(`Contribution not found: ${contribError.message}`);

        const org = (contribution as any).organizations;
        const donor = (contribution as any).donors;

        // Generate receipt number if not already generated
        let receiptNumber = contribution.receipt_number;
        if (!receiptNumber) {
          const { data: newReceiptNum } = await this.supabase.rpc('generate_receipt_number', {
            p_org_id: contribution.org_id,
          });
          receiptNumber = newReceiptNum;
        }

        // Build goods/services statement
        const goodsServicesStatement = contribution.quid_pro_quo_value > 0
          ? `The estimated value of goods and services provided in exchange for this contribution was $${contribution.quid_pro_quo_value.toLocaleString()}. The tax-deductible portion is $${contribution.tax_deductible_amount.toLocaleString()}.`
          : 'No goods or services were provided in exchange for this contribution.';

        // Update contribution with receipt info
        const { error: updateError } = await this.supabase
          .from('contributions_received')
          .update({
            receipt_number: receiptNumber,
            receipt_status: 'generated',
            receipt_generated_at: new Date().toISOString(),
          })
          .eq('id', args.contribution_id);

        if (updateError) throw new Error(`Error updating contribution: ${updateError.message}`);

        // Create acknowledgment letter record for the receipt
        const donorName = donor
          ? (!donor.is_organization
              ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
              : donor.organization_name)
          : 'Donor';

        const receiptBody = `Dear ${donorName},

Thank you for your generous contribution to ${org?.name || 'our organization'}.

This letter serves as your official receipt for tax purposes.

Contribution Details:
- Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
- Amount: $${contribution.amount.toLocaleString()}
- Receipt Number: ${receiptNumber}

${goodsServicesStatement}

${org?.ein ? `Organization EIN: ${org.ein}` : ''}

Thank you for your support!

Sincerely,
${org?.name || 'The Organization'}`;

        const { data: letter } = await this.supabase
          .from('acknowledgment_letters')
          .insert({
            org_id: contribution.org_id,
            donor_id: contribution.donor_id,
            contribution_id: contribution.id,
            letter_type: 'tax_receipt',
            subject: `Tax Receipt - ${receiptNumber}`,
            body: receiptBody,
            org_name: org?.name,
            org_ein: org?.ein,
            contribution_amount: contribution.amount,
            contribution_date: contribution.contribution_date,
            goods_services_statement: goodsServicesStatement,
            status: 'draft',
            created_by: userId,
          })
          .select()
          .single();

        // Send immediately if requested
        if (args.send_immediately && donor?.email) {
          await this.supabase
            .from('acknowledgment_letters')
            .update({
              status: 'sent',
              sent_via: 'email',
              sent_at: new Date().toISOString(),
            })
            .eq('id', letter?.id);

          await this.supabase
            .from('contributions_received')
            .update({
              receipt_status: 'sent',
              receipt_sent_at: new Date().toISOString(),
            })
            .eq('id', args.contribution_id);
        }

        return {
          action: null,
          output: {
            success: true,
            receipt_number: receiptNumber,
            letter_id: letter?.id,
            amount: contribution.amount,
            tax_deductible_amount: contribution.tax_deductible_amount,
            donor_name: donorName,
            sent: args.send_immediately && donor?.email ? true : false,
            message: `Tax receipt ${receiptNumber} generated for $${contribution.amount.toLocaleString()}${args.send_immediately && donor?.email ? ' and sent to ' + donor.email : ''}`,
          },
        };
      }

      case 'generate_acknowledgment': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        InputValidator.validateUUID(args.donor_id, 'donor_id');
        if (args.contribution_id) InputValidator.validateUUID(args.contribution_id, 'contribution_id');
        if (args.letter_type) {
          InputValidator.validateEnum(args.letter_type, 'letter_type', [
            'thank_you', 'annual_summary', 'welcome', 'custom'
          ] as const);
        }
        if (args.send_via) {
          InputValidator.validateEnum(args.send_via, 'send_via', ['email', 'mail', 'both'] as const);
        }

        // Get donor info
        const { data: donor, error: donorError } = await this.supabase
          .from('donors')
          .select('*')
          .eq('id', args.donor_id)
          .single();

        if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

        // Get organization info
        const { data: org } = await this.supabase
          .from('organizations')
          .select('name, ein')
          .eq('id', args.organization_id)
          .single();

        const donorName = !donor.is_organization
          ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
          : donor.organization_name;

        const letterType = args.letter_type || 'thank_you';
        let subject = '';
        let body = '';

        if (letterType === 'thank_you') {
          // Get contribution if specified
          let contributionInfo = '';
          if (args.contribution_id) {
            const { data: contrib } = await this.supabase
              .from('contributions_received')
              .select('amount, contribution_date')
              .eq('id', args.contribution_id)
              .single();

            if (contrib) {
              contributionInfo = `\n\nYour recent gift of $${contrib.amount.toLocaleString()} on ${new Date(contrib.contribution_date).toLocaleDateString()} will make a real difference in our work.`;
            }
          }

          subject = `Thank You for Your Generous Support`;
          body = `Dear ${donorName},

Thank you so much for your generous support of ${org?.name || 'our organization'}!${contributionInfo}

${args.custom_message || 'Your contribution helps us continue our important work in the community.'}

We are deeply grateful for donors like you who make our mission possible.

With sincere thanks,
${org?.name || 'The Organization'}`;

        } else if (letterType === 'annual_summary') {
          const currentYear = new Date().getFullYear();
          const { data: yearContribs } = await this.supabase
            .from('contributions_received')
            .select('amount, is_tax_deductible')
            .eq('donor_id', args.donor_id)
            .gte('contribution_date', `${currentYear}-01-01`)
            .lte('contribution_date', `${currentYear}-12-31`);

          const contribs = yearContribs || [];
          const totalContributions = contribs.reduce((s: number, c: any) => s + (c.amount || 0), 0);
          const totalTaxDeductible = contribs.filter((c: any) => c.is_tax_deductible).reduce((s: number, c: any) => s + (c.amount || 0), 0);

          subject = `Your ${currentYear} Giving Summary`;
          body = `Dear ${donorName},

Thank you for your incredible generosity this year!

Your ${currentYear} Giving Summary:
- Total Contributions: $${totalContributions.toLocaleString()}
- Number of Gifts: ${contribs.length}
- Total Tax-Deductible: $${totalTaxDeductible.toLocaleString()}

${args.custom_message || 'Your support has made a tremendous impact on our mission.'}

${org?.ein ? `Organization EIN: ${org.ein}` : ''}

With gratitude,
${org?.name || 'The Organization'}`;

        } else if (letterType === 'welcome') {
          subject = `Welcome to ${org?.name || 'Our Organization'}`;
          body = `Dear ${donorName},

Welcome to the ${org?.name || 'our organization'} family!

Thank you for your first gift to our organization. We are thrilled to have you as a supporter.

${args.custom_message || 'Your generosity will help us continue our important work.'}

We look forward to keeping you updated on the impact of your support.

Warmly,
${org?.name || 'The Organization'}`;

        } else {
          subject = args.custom_message?.substring(0, 50) || 'Message from ' + (org?.name || 'Our Organization');
          body = args.custom_message || '';
        }

        // Create the acknowledgment letter
        const { data: letter, error: letterError } = await this.supabase
          .from('acknowledgment_letters')
          .insert({
            org_id: args.organization_id,
            donor_id: args.donor_id,
            contribution_id: args.contribution_id || null,
            letter_type: letterType,
            subject,
            body,
            org_name: org?.name,
            org_ein: org?.ein,
            status: 'draft',
            sent_via: args.send_via || 'email',
            created_by: userId,
          })
          .select()
          .single();

        if (letterError) throw new Error(`Error creating letter: ${letterError.message}`);

        // Update donor acknowledgment status if contribution specified
        if (args.contribution_id) {
          await this.supabase
            .from('contributions_received')
            .update({ acknowledgment_status: 'draft' })
            .eq('id', args.contribution_id);
        }

        return {
          action: null,
          output: {
            success: true,
            letter_id: letter.id,
            letter_type: letterType,
            donor_name: donorName,
            subject,
            status: 'draft',
            message: `${letterType.replace('_', ' ')} letter created for ${donorName}`,
          },
        };
      }

      case 'get_donor_summary': {
        InputValidator.validateUUID(args.donor_id, 'donor_id');

        // Get donor details
        const { data: donor, error: donorError } = await this.supabase
          .from('v_donor_summary')
          .select('*')
          .eq('donor_id', args.donor_id)
          .single();

        if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

        const result: any = {
          donor: {
            id: donor.donor_id,
            name: donor.display_name,
            email: donor.email,
            type: donor.is_organization ? 'organization' : 'individual',
            tier: donor.tier,
            status: donor.recency_status,
          },
          giving_stats: {
            total_lifetime: donor.total_lifetime_giving,
            total_ytd: donor.total_ytd_giving,
            gift_count: donor.gift_count,
            largest_gift: donor.largest_gift,
            average_gift: donor.average_gift,
            first_gift_date: donor.first_gift_date,
            last_gift_date: donor.last_gift_date,
            days_since_last_gift: donor.days_since_last_gift,
          },
          pending_items: {
            has_pending_receipts: donor.has_pending_receipts,
            has_pending_acknowledgments: donor.has_pending_acknowledgments,
          },
        };

        // Include contributions if requested
        if (args.include_contributions !== false) {
          let contribQuery = this.supabase
            .from('contributions_received')
            .select('id, contribution_date, amount, contribution_type, designation, receipt_status, acknowledgment_status')
            .eq('donor_id', args.donor_id)
            .order('contribution_date', { ascending: false });

          if (args.year) {
            const yearStart = `${args.year}-01-01`;
            const yearEnd = `${args.year}-12-31`;
            contribQuery = contribQuery.gte('contribution_date', yearStart).lte('contribution_date', yearEnd);
          }

          const { data: contributions } = await contribQuery.limit(50);
          result.contributions = contributions || [];
        }

        return {
          action: null,
          output: result,
        };
      }

      case 'search_donors': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        if (args.donor_type) {
          InputValidator.validateEnum(args.donor_type, 'donor_type', [
            'individual', 'foundation', 'corporation', 'government', 'other'
          ] as const);
        }
        if (args.donor_tier) {
          InputValidator.validateEnum(args.donor_tier, 'donor_tier', [
            'major', 'leadership', 'sustainer', 'supporter'
          ] as const);
        }
        if (args.recency_status) {
          InputValidator.validateEnum(args.recency_status, 'recency_status', [
            'active', 'lapsed', 'inactive'
          ] as const);
        }
        if (args.min_lifetime_giving) {
          InputValidator.validateNumber(args.min_lifetime_giving, 'min_lifetime_giving', { min: 0 });
        }

        const limit = Math.min(args.limit || 50, 100);

        // Use the view for computed fields
        let query = this.supabase
          .from('v_donor_summary')
          .select('*')
          .eq('org_id', args.organization_id);

        // Apply filters
        if (args.name) {
          query = query.ilike('display_name', `%${args.name}%`);
        }
        if (args.email) {
          query = query.ilike('email', `%${args.email}%`);
        }
        if (args.donor_type) {
          query = query.eq('is_organization', args.donor_type !== 'individual');
        }
        if (args.donor_tier) {
          query = query.eq('tier', args.donor_tier);
        }
        if (args.recency_status) {
          query = query.eq('recency_status', args.recency_status);
        }
        if (args.min_lifetime_giving) {
          query = query.gte('total_lifetime_giving', args.min_lifetime_giving);
        }
        if (args.has_pending_receipts) {
          query = query.eq('has_pending_receipts', true);
        }
        if (args.has_pending_acknowledgments) {
          query = query.eq('has_pending_acknowledgments', true);
        }

        const { data: donors, error } = await query
          .order('total_lifetime_giving', { ascending: false })
          .limit(limit);

        if (error) throw new Error(`Error searching donors: ${error.message}`);

        return {
          action: null,
          output: {
            donors: (donors || []).map((d: any) => ({
              donor_id: d.donor_id,
              name: d.display_name,
              email: d.email,
              type: d.is_organization ? 'organization' : 'individual',
              tier: d.donor_tier,
              status: d.recency_status,
              total_lifetime_giving: d.total_lifetime_giving,
              total_ytd_giving: d.total_ytd_giving,
              gift_count: d.gift_count,
              last_gift_date: d.last_gift_date,
              has_pending_receipts: d.has_pending_receipts,
              has_pending_acknowledgments: d.has_pending_acknowledgments,
            })),
            count: donors?.length || 0,
            filters_applied: Object.keys(args).filter(k => k !== 'organization_id' && k !== 'limit' && args[k] !== undefined),
          },
        };
      }

      // ==================== COMPLIANCE & REGULATORY MODULE ====================
      case 'get_compliance_status': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Advanced compliance dashboard (self-dealing incidents, payout status, upcoming deadlines) requires migrations not yet deployed. Use get_state_registration_status and track_filing_deadline for available compliance data.',
          },
        };
      }

      case 'calculate_payout_requirement': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Payout calculation requires payout_history and v_payout_status (not yet deployed in the clean migration set).',
          },
        };
      }

      case 'get_payout_forecast': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Payout forecast requires payout_history and qualifying_distributions tables (not yet deployed in the clean migration set).',
          },
        };
      }

      case 'screen_for_self_dealing': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Self-dealing screening requires the disqualified_persons and self_dealing_incidents migrations (not yet deployed). Please log incidents manually.',
          },
        };
      }

      case 'register_disqualified_person': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Disqualified person registry requires the disqualified_persons migration (not yet deployed). Please track manually.',
          },
        };
      }

      case 'track_filing_deadline': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        if (args.filing_id) InputValidator.validateUUID(args.filing_id, 'filing_id');
        if (args.due_date) InputValidator.validateDateString(args.due_date, 'due_date');
        if (args.extension_due_date) InputValidator.validateDateString(args.extension_due_date, 'extension_due_date');
        if (args.status) {
          InputValidator.validateEnum(args.status, 'status', [
            'upcoming', 'in_progress', 'filed', 'extended', 'overdue', 'waived', 'not_applicable',
          ] as const);
        }

        if (args.filing_id) {
          // Update existing
          const updateData: any = {};
          const fields = ['status', 'filing_reference', 'extension_due_date', 'notes', 'description', 'completed_at'];
          for (const f of fields) {
            if (args[f] !== undefined) updateData[f] = args[f];
          }
          if (args.status === 'filed') {
            updateData.completed_by = userId;
            if (!updateData.completed_at) updateData.completed_at = new Date().toISOString();
          }

          const { data, error } = await this.supabase
            .from('filing_calendar')
            .update(updateData)
            .eq('id', args.filing_id)
            .eq('org_id', args.organization_id)
            .select()
            .single();

          if (error) throw new Error(`Error updating filing: ${error.message}`);

          return {
            action: null,
            output: { success: true, action: 'updated', filing: data },
          };
        } else {
          // Create new
          if (!args.filing_type || !args.title || !args.due_date) {
            throw new Error('filing_type, title, and due_date are required to create a new filing');
          }

          const { data, error } = await this.supabase
            .from('filing_calendar')
            .insert({
              org_id: args.organization_id,
              filing_type: args.filing_type,
              title: args.title || args.filing_type,
              jurisdiction: args.jurisdiction || 'federal',
              description: args.description || null,
              due_date: args.due_date,
              extension_due_date: args.extension_due_date || null,
              status: args.status || 'upcoming',
            })
            .select()
            .single();

          if (error) throw new Error(`Error creating filing: ${error.message}`);

          return {
            action: {
              id: crypto.randomUUID(),
              sessionId,
              portfolioId,
              userId,
              actionType: 'create',
              entityType: 'compliance_filing' as any,
              entityId: data.id,
              operationData: { table: 'filing_calendar', after: data },
              aiReasoning: `Created ${data.filing_type} deadline for ${data.tax_year} due ${data.due_date}`,
              userPrompt,
              status: 'applied',
              batchId,
              sequenceOrder,
            },
            output: {
              success: true,
              action: 'created',
              filing: data,
              message: `${data.filing_type.replace(/_/g, '-').toUpperCase()} deadline added for tax year ${data.tax_year}, due ${data.due_date}`,
            },
          };
        }
      }

      case 'log_expenditure_responsibility': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Expenditure responsibility tracking requires the expenditure_responsibility_grants migration (not yet deployed). Please track grant compliance manually.',
          },
        };
      }

      case 'assess_qualifying_distribution': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Qualifying distribution tracking requires the qualifying_distributions and payout_history migrations (not yet deployed). Please track distributions manually.',
          },
        };
      }

      case 'get_990pf_export_data': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: '990-PF export requires the payout_history and qualifying_distributions migrations (not yet deployed). Please compile this data manually.',
          },
        };
      }

      case 'get_state_registration_status': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');

        let query = this.supabase
          .from('state_registrations')
          .select('*')
          .eq('org_id', args.organization_id)
          .order('state');

        if (args.state_code) {
          query = query.eq('state', args.state_code.toUpperCase());
        }
        if (args.status_filter) {
          query = query.eq('status', args.status_filter);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Error fetching state registrations: ${error.message}`);

        const registrations = data || [];
        const summary = {
          total: registrations.length,
          active: registrations.filter((r: any) => r.status === 'active').length,
          renewal_due: registrations.filter((r: any) => r.status === 'renewal_due').length,
          expired: registrations.filter((r: any) => r.status === 'expired').length,
          exempt: registrations.filter((r: any) => r.status === 'exempt').length,
          not_registered: registrations.filter((r: any) => r.status === 'not_registered').length,
        };

        return {
          action: null,
          output: { registrations, summary },
        };
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
        .select('id, name, description, org_id')
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

    // Fetch org-level context if this portfolio belongs to an org
    let orgContext: {
      name: string;
      org_type: string;
      modules: Record<string, boolean>;
      otherPortfolioCount: number;
      otherPortfolioValue: number;
      donorCount: number | null;
      donorGivingThisYear: number | null;
      nextFiling: { description: string; due_date: string } | null;
    } | null = null;

    const orgId = (portfolio.data as any)?.org_id;
    if (orgId) {
      const currentYear = new Date().getFullYear();
      const [orgRow, otherPortfolios, donorStats, nextFiling] = await Promise.all([
        this.supabase
          .from('organizations')
          .select('name, org_type, modules')
          .eq('id', orgId)
          .single(),
        this.supabase
          .from('portfolios')
          .select('id, name')
          .eq('org_id', orgId)
          .neq('id', portfolioId),
        this.supabase
          .from('donors')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId),
        this.supabase
          .from('filing_calendar')
          .select('description, due_date, filing_type')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .gte('due_date', new Date().toISOString().slice(0, 10))
          .order('due_date', { ascending: true })
          .limit(1),
      ]);

      const modules: Record<string, boolean> = (orgRow.data as any)?.modules ?? {};

      // Sum AUM across other portfolios
      let otherPortfolioValue = 0;
      if (otherPortfolios.data && otherPortfolios.data.length > 0) {
        const otherIds = otherPortfolios.data.map((p: any) => p.id);
        const { data: otherHoldings } = await this.supabase
          .from('holdings')
          .select('funds_allocated')
          .in('portfolio_id', otherIds);
        otherPortfolioValue = (otherHoldings || []).reduce(
          (sum: number, h: any) => sum + (h.funds_allocated || 0), 0
        );
      }

      // Donor giving this year (from tax_contributions)
      let donorGivingThisYear: number | null = null;
      if (modules.donors) {
        const { data: givingData } = await this.supabase
          .from('tax_contributions')
          .select('amount_usd')
          .eq('tax_year', currentYear)
          .in('portfolio_id',
            [portfolioId, ...(otherPortfolios.data?.map((p: any) => p.id) ?? [])]
          );
        if (givingData) {
          donorGivingThisYear = givingData.reduce((sum: number, r: any) => sum + (r.amount_usd || 0), 0);
        }
      }

      orgContext = {
        name: (orgRow.data as any)?.name ?? 'Unknown Org',
        org_type: (orgRow.data as any)?.org_type ?? '',
        modules,
        otherPortfolioCount: otherPortfolios.data?.length ?? 0,
        otherPortfolioValue,
        donorCount: modules.donors ? (donorStats.count ?? 0) : null,
        donorGivingThisYear: modules.donors ? donorGivingThisYear : null,
        nextFiling: modules.compliance && nextFiling.data?.[0]
          ? { description: nextFiling.data[0].description || nextFiling.data[0].filing_type, due_date: nextFiling.data[0].due_date }
          : null,
      };
    }

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
      orgContext,
    };
  }

  /**
   * Build system prompt for the configured AI provider.
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

    // Build org context block if available
    const orgBlock = context.orgContext ? (() => {
      const o = context.orgContext;
      const lines = [
        `Organization: ${o.name}${o.org_type ? ` (${o.org_type.replace(/_/g, ' ')})` : ''}`,
      ];
      if (o.otherPortfolioCount > 0) {
        lines.push(
          `Other portfolios in this org: ${o.otherPortfolioCount} with combined value ${formatCurrency(o.otherPortfolioValue)}`
        );
      }
      if (o.donorCount !== null) {
        lines.push(
          `Donor base: ${o.donorCount} donors${o.donorGivingThisYear !== null ? `, ${formatCurrency(o.donorGivingThisYear)} given this year` : ''}`
        );
      }
      if (o.nextFiling) {
        lines.push(`Next filing: ${o.nextFiling.description} due ${o.nextFiling.due_date}`);
      }
      return `=== ORGANIZATION CONTEXT ===\n${lines.join('\n')}\n`;
    })() : '';

    const prompt = `You are Ben, a friendly AI portfolio management assistant and data visualization expert. You help users manage their impact investment portfolio and create compelling visualizations.

⚠️ CRITICAL: You MUST use function calls to display visualizations. NEVER use markdown images, placeholders, or text descriptions as substitutes for actual widget displays. When users ask to see/show/display something, call the appropriate function (display_widget, create_portfolio_widget, etc).

${orgBlock}=== PORTFOLIO OVERVIEW ===
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

    if (this.aiInstructions) {
      prompt += `\n\n## Org-Specific Instructions\n${this.aiInstructions}\n`;
    }

    return prompt;
  }
}

// Backwards-compatible export for older imports. New code should import
// PortfolioAssistant from '@/lib/ai/portfolio-assistant'.
export { PortfolioAssistant as ClaudePortfolioAssistant };
