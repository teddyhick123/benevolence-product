// @ts-nocheck - Supabase generated types are incorrect for this file
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from './ai-action-executor';

// AI Action types
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
  output: any; // Output varies by tool
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
    if (value === undefined || value === null) return; // Allow optional
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
    if (value === undefined || value === null) return; // Allow optional
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
    if (value === undefined || value === null) return; // Allow optional
    if (!allowedValues.includes(value as T)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
  },

  validateDateString(value: any, fieldName: string): void {
    if (value === undefined || value === null) return; // Allow optional
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date string (YYYY-MM-DD)`);
    }
  },

  validateArray(value: any, fieldName: string, options?: { maxLength?: number }): void {
    if (value === undefined || value === null) return; // Allow optional
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

// Tool definitions for OpenAI function calling
const PORTFOLIO_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_holding',
      description: 'Create a new holding/investment in the portfolio',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'update_holding',
      description: 'Update an existing holding',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'remove_holding',
      description: 'Delete a holding from the portfolio',
      parameters: {
        type: 'object',
        properties: {
          holding_id: { type: 'string', description: 'UUID of the holding to remove' },
          reason: { type: 'string', description: 'Reason for removal (optional)' },
        },
        required: ['holding_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_metric_fact',
      description: 'Add a new metric/KPI fact for a holding',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'create_widget',
      description: 'Create a visualization widget for a holding',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'add_location',
      description: 'Add a geographic location for a holding',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'list_holdings',
      description: 'Get a list of all holdings in the portfolio',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'], description: 'Filter by status (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_holdings',
      description: 'Search and filter holdings by multiple criteria. Use this for queries like "find all solar holdings" or "holdings with allocation over 1M"',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'get_metric_trend',
      description: 'Get historical trend data for a specific metric across the portfolio or a holding. Returns time series data suitable for visualization.',
      parameters: {
        type: 'object',
        properties: {
          metric_code: { type: 'string', description: 'Metric code (e.g., RENEWABLE_MWH, CLIENTS_SERVED)' },
          holding_id: { type: 'string', description: 'Specific holding ID (optional - if omitted, aggregates across portfolio)' },
          window: { type: 'string', enum: ['3m', '6m', '12m', '24m', 'all'], description: 'Time window (default: 12m)' },
        },
        required: ['metric_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_holdings',
      description: 'Compare multiple holdings on a specific metric. Use for questions like "compare carbon emissions across my holdings" or "which holding has the most clients"',
      parameters: {
        type: 'object',
        properties: {
          metric_code: { type: 'string', description: 'Metric to compare' },
          holding_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of holding IDs to compare (optional - if omitted, compares all holdings)'
          },
          sort_order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default: desc)' },
          limit: { type: 'number', description: 'Maximum number of holdings to return (default: 10)' },
        },
        required: ['metric_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_summary',
      description: 'Get a comprehensive summary of portfolio performance including KPIs, sector breakdown, and top holdings. Use for questions like "how is the portfolio doing?" or "give me an overview"',
      parameters: {
        type: 'object',
        properties: {
          include_kpis: { type: 'boolean', description: 'Include KPI performance (default: true)' },
          include_sectors: { type: 'boolean', description: 'Include sector breakdown (default: true)' },
          include_top_holdings: { type: 'boolean', description: 'Include top holdings by allocation (default: true)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_holding_details',
      description: 'Get detailed information about a specific holding',
      parameters: {
        type: 'object',
        properties: {
          holding_id: { type: 'string', description: 'UUID of the holding' },
        },
        required: ['holding_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_widgets',
      description: 'Get a list of all visualization widgets in the portfolio',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of widgets to return (default: 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'display_widget',
      description: 'REQUIRED: Display an existing widget inline in the conversation. ALWAYS use this function when users ask to see/show/display a widget. DO NOT use markdown images or text descriptions - call this function to make the actual widget appear. Widget IDs are provided in the system context - look for them there.',
      parameters: {
        type: 'object',
        properties: {
          widget_id: { type: 'string', description: 'UUID of the widget to display (available in the "Existing Widgets" section of the context)' },
        },
        required: ['widget_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_portfolio_widget',
      description: 'Create a visualization widget at the portfolio level. IMPORTANT: You MUST provide a complete config object with ALL required fields for the widget type. See the system prompt for detailed config examples. Common mistake: forgetting metric_code, perUnit, mode, rings, or target fields.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['kpi_trend', 'radial_progress', 'people_grid_auto', 'holdings_pie_auto', 'emissions_bar', 'd3_json'],
            description: 'Widget type: kpi_trend (needs metric_code), radial_progress (needs rings array), people_grid_auto (needs metric_code, perUnit, mode), holdings_pie_auto (auto-fetches holdings, no metric needed)'
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
  },
  {
    type: 'function',
    function: {
      name: 'generate_d3_chart',
      description: 'Generate a custom D3 visualization from data. Creates polished charts with tooltips, gridlines, and legends. Use this when users request custom charts with specific data. IMPORTANT: Call list_holdings, get_metric_trend, or compare_holdings FIRST to fetch the data, then pass it to this function.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Chart title (e.g., "Funds Allocated by Sector")' },
          chart_type: {
            type: 'string',
            enum: ['bar', 'line', 'area', 'scatter', 'pie', 'donut'],
            description: 'Chart type: bar (comparisons), line (trends), area (cumulative), scatter (correlations), pie/donut (proportions)'
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
            description: 'Array of hex colors for chart elements (e.g., ["#3b82f6", "#10b981", "#f59e0b"])'
          },
        },
        required: ['title', 'chart_type', 'data', 'x_field', 'y_field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chart_data',
      description: 'Fetch and format data specifically for visualization. Returns pre-formatted data with suggested chart type and styling. Use this BEFORE generate_d3_chart to get properly formatted data.',
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            enum: ['holdings_by_sector', 'holdings_by_country', 'metric_trend', 'metric_comparison', 'allocation_breakdown', 'status_breakdown'],
            description: 'Type of data to fetch: holdings_by_sector (pie/bar), metric_trend (line), metric_comparison (bar), allocation_breakdown (pie/donut), status_breakdown (pie)'
          },
          metric_code: {
            type: 'string',
            description: 'Required for metric_trend and metric_comparison data types'
          },
          window: {
            type: 'string',
            enum: ['3m', '6m', '12m', '24m', 'all'],
            description: 'Time window for trends (default: 12m)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (default: 10)'
          },
        },
        required: ['data_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_holding_report',
      description: 'Generate a comprehensive report about a specific holding/charity with inline charts. Fetches all holding data, charity info, and metric history, then auto-generates relevant chart visualizations. The AI should write a narrative report around the returned data — charts will appear inline automatically.',
      parameters: {
        type: 'object',
        properties: {
          holding_id: { type: 'string', description: 'UUID of the holding to report on (find in HOLDINGS section)' },
        },
        required: ['holding_id'],
      },
    },
  },
];

/**
 * AI Assistant for portfolio management
 */
export class AIPortfolioAssistant {
  private openai: OpenAI;
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseServiceRole: string, openaiApiKey: string) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceRole,
      { auth: { persistSession: false } }
    );
  }

  /**
   * Process a user message and generate AI response with actions
   */
  async chat(params: {
    portfolioId: string;
    userId: string;
    sessionId: string;
    message: string;
    conversationHistory?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  }) {
    const { portfolioId, userId, sessionId, message, conversationHistory = [] } = params;

    // Get portfolio context
    const context = await this.getPortfolioContext(portfolioId);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(context);

    // Build messages
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    // Call OpenAI with function calling
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: PORTFOLIO_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];

    // Execute tool calls and track actions
    const actions: AIAction[] = [];
    const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

    if (toolCalls.length > 0) {
      const batchId = crypto.randomUUID();

      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        if (toolCall.type !== 'function') continue;
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

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
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result.output),
          });
        } catch (error) {
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: (error as Error).message }),
          });
        }
      }

      // Get final response with tool results
      const finalResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          ...messages,
          assistantMessage,
          ...toolResults,
        ],
        temperature: 0.7,
      });

      return {
        message: finalResponse.choices[0].message.content || '',
        actions,
        toolCalls,
      };
    }

    return {
      message: assistantMessage.content || '',
      actions: [],
      toolCalls: [],
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

        // This is read-only, no action logged
        return {
          action: null,
          output: { holdings: data || [] },
        };
      }

      case 'search_holdings': {
        // Validate inputs
        InputValidator.validateString(args.sector, 'sector', { maxLength: 200 });
        InputValidator.validateString(args.country, 'country', { maxLength: 100 });
        InputValidator.validateEnum(args.status, 'status', ['Active', 'Exited', 'Pipeline'] as const);
        InputValidator.validateNumber(args.min_allocation, 'min_allocation', { min: 0, max: 1e12 });
        InputValidator.validateNumber(args.max_allocation, 'max_allocation', { min: 0, max: 1e12 });
        InputValidator.validateString(args.name_contains, 'name_contains', { maxLength: 200 });

        // Validate min <= max if both provided
        if (args.min_allocation !== undefined && args.max_allocation !== undefined && args.min_allocation > args.max_allocation) {
          throw new ValidationError('min_allocation cannot be greater than max_allocation');
        }

        let query = this.supabase
          .from('holdings')
          .select('id, name, sector, country, status, funds_allocated, description')
          .eq('portfolio_id', portfolioId);

        if (args.sector) {
          query = query.ilike('sector', `%${args.sector}%`);
        }
        if (args.country) {
          query = query.ilike('country', `%${args.country}%`);
        }
        if (args.status) {
          query = query.eq('status', args.status);
        }
        if (args.min_allocation) {
          query = query.gte('funds_allocated', args.min_allocation);
        }
        if (args.max_allocation) {
          query = query.lte('funds_allocated', args.max_allocation);
        }
        if (args.name_contains) {
          query = query.ilike('name', `%${args.name_contains}%`);
        }

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
        // Normalize metric_code to uppercase
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        // Validate inputs
        InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        if (!args.metric_code) {
          throw new ValidationError('metric_code is required');
        }
        if (args.holding_id) {
          InputValidator.validateUUID(args.holding_id, 'holding_id');
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);

        // Use 'all' as default to avoid missing older data
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

        // Group by period for aggregation
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

        // If no data found, get list of available metrics to help the AI
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
        // Normalize metric_code to uppercase
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        // Validate inputs
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

        // Get latest metric value for each holding
        const { data: holdings } = await this.supabase
          .from('holdings')
          .select('id, name, sector')
          .eq('portfolio_id', portfolioId);

        const holdingIds = args.holding_ids || holdings?.map((h: any) => h.id) || [];
        const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h]));

        // Get latest facts for each holding
        const { data: facts } = await this.supabase
          .from('metric_facts')
          .select('holding_id, value, unit, period_end')
          .eq('metric_code', args.metric_code)
          .in('holding_id', holdingIds)
          .order('period_end', { ascending: false });

        // Get latest value per holding
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

        // If no data found, get list of available metrics to help the AI
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

        // Get holdings
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
          // Get KPI definitions with targets
          const { data: kpis } = await this.supabase
            .from('portfolio_metric_targets')
            .select('metric_code, target_value, display_name')
            .eq('portfolio_id', portfolioId);

          // Get latest metric values
          const { data: facts } = await this.supabase
            .from('metric_facts')
            .select('metric_code, value, unit, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          // Aggregate by metric
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

        // This is read-only, no action logged
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

        // This is read-only, no action logged
        return {
          action: null,
          output: { widgets: data || [], count: data?.length || 0 },
        };
      }

      case 'display_widget': {
        // Fetch the widget from either portfolio or holding widgets table
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

        // Create a display action so we can track it and render it inline
        const { data: action } = await this.supabase
          .from('ai_actions')
          .insert({
            session_id: sessionId,
            portfolio_id: portfolioId,
            user_id: userId,
            action_type: 'create', // Use 'create' so it gets picked up by the widget detection
            entity_type: 'widget',
            entity_id: widget.id,
            operation_data: {
              table: portfolioWidget ? 'widgets' : 'holding_widgets',
              after: widget,
              display_only: true, // Mark this as display-only for undo purposes
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
        // Create preview widget (not saved to DB yet)
        const widgetPreview = {
          id: crypto.randomUUID(), // Temporary ID for frontend
          portfolio_id: portfolioId,
          type: args.type,
          title: args.title,
          config: args.config || {},
          position: 0,
          is_preview: true, // Mark as preview
        };

        // Create a "preview" action (not actually saved to DB)
        const previewAction: any = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          portfolio_id: portfolioId,
          user_id: userId,
          action_type: 'preview', // Special type for previews
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
        // Normalize metric_code to uppercase
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        // Validate inputs
        const validDataTypes = ['holdings_by_sector', 'holdings_by_country', 'metric_trend', 'metric_comparison', 'allocation_breakdown', 'status_breakdown'] as const;
        InputValidator.validateEnum(args.data_type, 'data_type', validDataTypes);
        if (!args.data_type) {
          throw new ValidationError('data_type is required');
        }
        if (args.metric_code) {
          InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        }
        // Require metric_code for metric-based data types
        if (['metric_trend', 'metric_comparison'].includes(args.data_type) && !args.metric_code) {
          throw new ValidationError(`metric_code is required for data_type '${args.data_type}'`);
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);
        InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

        const limit = args.limit || 10;
        // Use 'all' as default to avoid missing older data
        const window = args.window || 'all';

        // Helper function to create chart preview action
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

            // Use 'all' as default to avoid missing older data
            const effectiveWindow = (args.window as TimeWindow) || 'all';
            const startDate = TimeWindowHelper.getStartDate(effectiveWindow);

            const { data: facts } = await this.supabase
              .from('metric_facts')
              .select('value, period_end, holdings!inner(portfolio_id)')
              .eq('metric_code', args.metric_code)
              .eq('holdings.portfolio_id', portfolioId)
              .gte('period_end', startDate)
              .order('period_end', { ascending: true });

            // Aggregate by period
            const byPeriod: Record<string, number> = {};
            (facts || []).forEach((fact: any) => {
              const period = fact.period_end;
              byPeriod[period] = (byPeriod[period] || 0) + (fact.value || 0);
            });

            const chartData = Object.entries(byPeriod)
              .map(([date, value]) => ({ date, value }))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // If no data found, get list of available metrics to help the AI
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

            // Auto-generate the chart widget so the AI doesn't need to call generate_d3_chart separately
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

            // Get latest value per holding
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

            // If no data found, get list of available metrics to help the AI
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

            // Auto-generate the bar chart widget
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
        // Transform the chart parameters into a d3_json widget config
        const isPieOrDonut = args.chart_type === 'pie' || args.chart_type === 'donut';

        const d3Config = {
          d3: {
            kind: args.chart_type,
            data: args.data,
            encoding: {
              x: args.x_field,
              y: args.y_field,
              ...(args.series_field && { series: args.series_field }),
              // For pie/donut, map x to label and y to value
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

        // Create preview widget (not saved to DB yet)
        const widgetPreview = {
          id: crypto.randomUUID(), // Temporary ID for frontend
          portfolio_id: portfolioId,
          type: 'd3_json',
          title: args.title,
          config: d3Config,
          position: 0,
          is_preview: true, // Mark as preview
        };

        // Create a "preview" action (not actually saved to DB)
        const previewAction: any = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          portfolio_id: portfolioId,
          user_id: userId,
          action_type: 'preview', // Special type for previews
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

        // 1. Fetch holding + charity data
        const { data: holdingData } = await this.supabase
          .from('holdings')
          .select('*, charities(*)')
          .eq('id', args.holding_id)
          .single();

        if (!holdingData) {
          throw new Error(`Holding ${args.holding_id} not found`);
        }

        // 2. Fetch all metric_facts for this holding (no time filter)
        const { data: metricFacts } = await this.supabase
          .from('metric_facts')
          .select('metric_code, value, unit, period_end')
          .eq('holding_id', args.holding_id)
          .order('period_end', { ascending: true });

        const facts = metricFacts || [];

        // 3. Group facts by metric_code
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

        // 4. Auto-generate chart previews for metrics with 2+ data points
        const additionalActions: any[] = [];
        const chartWidgets: any[] = [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        let chartIndex = 0;

        for (const [metricCode, series] of Object.entries(metricGroups)) {
          if (series.length >= 2) {
            // Create a line chart for this metric's trend
            const chartData = series.map(s => ({ date: s.date, value: s.value }));
            const unit = series[0]?.unit || '';
            const chartTitle = `${holdingData.name} — ${metricCode}${unit ? ` (${unit})` : ''}`;

            const d3Config = {
              d3: {
                kind: 'line',
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
              ai_reasoning: `Auto-generated trend chart for ${metricCode} in holding report`,
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder + chartIndex + 1,
            };

            additionalActions.push(previewAction);
            chartWidgets.push({ id: widgetPreview.id, title: chartTitle, metric: metricCode });
            chartIndex++;
          }
        }

        // 5. Build summary stats per metric
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

        // 6. Build charity context
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

        return {
          action: null,
          additionalActions,
          output: {
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
            charts_generated: chartWidgets.length,
            chart_details: chartWidgets,
            instructions: 'Write a detailed narrative report about this holding. Charts for metrics with trend data will appear inline automatically. Reference the data naturally in your narrative — do NOT list raw numbers as bullet points.',
          },
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
      // Portfolio metadata
      this.supabase
        .from('portfolios')
        .select('id, name, description')
        .eq('id', portfolioId)
        .single(),
      // All holdings with basic info
      this.supabase
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated')
        .eq('portfolio_id', portfolioId)
        .order('funds_allocated', { ascending: false }),
      // Available metrics
      this.supabase
        .from('metrics')
        .select('code, name, unit'),
      // Portfolio widgets
      this.supabase
        .from('widgets')
        .select('id, type, title')
        .eq('portfolio_id', portfolioId)
        .order('position', { ascending: true }),
      // KPI definitions with targets
      this.supabase
        .from('portfolio_metric_targets')
        .select('metric_code, target_value, display_name')
        .eq('portfolio_id', portfolioId),
      // Latest metric facts (aggregate across all holdings)
      this.supabase
        .from('metric_facts')
        .select('metric_code, value, unit, period_end, holdings!inner(portfolio_id)')
        .eq('holdings.portfolio_id', portfolioId)
        .order('period_end', { ascending: false }),
      // Recent AI actions (last 7 days)
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

    // Calculate portfolio summary stats
    const totalAUM = holdingsData.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = holdingsData.reduce((sum: number, h: any) => sum + (h.nav || 0), 0);

    // Sector breakdown
    const sectorBreakdown: Record<string, { count: number; funds: number }> = {};
    holdingsData.forEach((h: any) => {
      const sector: string = h.sector || 'Unspecified';
      if (!sectorBreakdown[sector]) {
        sectorBreakdown[sector] = { count: 0, funds: 0 };
      }
      sectorBreakdown[sector].count++;
      sectorBreakdown[sector].funds += h.funds_allocated || 0;
    });

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    holdingsData.forEach((h: any) => {
      const status: string = h.status || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    // Build KPI snapshot with latest values and targets
    const kpiSnapshot: Array<{
      metricCode: string;
      displayName: string;
      latestValue: number | null;
      target: number | null;
      unit: string | null;
      percentComplete: number | null;
    }> = [];

    // Group facts by metric and period, then get latest period's aggregated value
    const latestByMetric: Record<string, { value: number; unit: string | null; period: string | null }> = {};

    // First, group by metric_code and period_end to aggregate within periods
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

    // Now get the latest period for each metric (facts are already ordered by period_end desc)
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

    // Combine with KPI definitions
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

    // Also add metrics that have facts but no KPI definition
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

    // Build metricsWithData: metrics that actually have data in metric_facts for this portfolio
    // This is the critical information the AI needs to know what can be queried/visualized
    const metricsWithData: Array<{
      code: string;
      displayName: string;
      latestValue: number;
      unit: string | null;
      dataPoints: number;
      latestPeriod: string | null;
      earliestPeriod: string | null;
    }> = [];

    // Count data points and get date ranges per metric
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

    // Build the metricsWithData array from latestByMetric (metrics with actual data)
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

    // Sort by data points (most data first)
    metricsWithData.sort((a, b) => b.dataPoints - a.dataPoints);

    return {
      portfolio: portfolio.data,
      holdings: holdingsData,
      availableMetrics: [
        ...(metrics.data || []),
        ...kpiDefsData.map((k: any) => ({ code: k.metric_code }))
      ],
      metricsWithData, // NEW: metrics that actually have data
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
   * Build system prompt for the AI
   */
  private buildSystemPrompt(context: any): string {
    // Format currency
    const formatCurrency = (n: number) => n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `$${(n / 1_000).toFixed(0)}K`
        : `$${n}`;

    // Format sector breakdown
    const sectorSummary = Object.entries(context.summary.sectorBreakdown || {})
      .sort((a: any, b: any) => b[1].funds - a[1].funds)
      .slice(0, 5)
      .map(([sector, data]: [string, any]) => `  • ${sector}: ${data.count} holdings, ${formatCurrency(data.funds)}`)
      .join('\n');

    // Format KPI snapshot
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

    // Format recent actions
    const recentActionsSummary = context.recentActions
      .slice(0, 5)
      .map((a: any) => `  • ${a.action_type} ${a.entity_type}: ${a.ai_reasoning || 'No description'}`)
      .join('\n');

    // Format metrics with data - THIS IS CRITICAL for the AI to know what can be visualized
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

=== BEHAVIOR ===
• Be concise - especially after generating charts
• Use the data above to answer questions directly
• Create visualizations when asked
• Ask for confirmation on deletes
• When a metric doesn't exist, suggest available alternatives`;
  }
}
