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
      description: 'Generate a custom D3 visualization from data. Use this when users request custom charts with specific data (e.g., "bar chart of funds by sector"). You must provide the actual data array. IMPORTANT: Call list_holdings or get_holding_details FIRST to fetch the data, then pass it to this function.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Chart title (e.g., "Funds Allocated by Sector")' },
          chart_type: {
            type: 'string',
            enum: ['bar', 'line', 'area', 'scatter'],
            description: 'Type of D3 chart to generate (bar for comparisons, line for trends)'
          },
          data: {
            type: 'array',
            description: 'Array of data objects. Each object must have fields matching x_field and y_field. Example: [{sector: "Energy", funds: 1000000}, {sector: "Water", funds: 500000}]',
            items: { type: 'object' },
          },
          x_field: { type: 'string', description: 'Field name for x-axis (e.g., "sector", "name", "date")' },
          y_field: { type: 'string', description: 'Field name for y-axis (e.g., "funds_allocated", "value", "nav")' },
          series_field: { type: 'string', description: 'Field name for series grouping (optional, for multi-line charts)' },
          x_type: { type: 'string', enum: ['linear', 'time'], description: 'X-axis type (use "time" for dates)' },
          color: { type: 'string', description: 'Chart color (hex code like "#3b82f6", optional)' },
        },
        required: ['title', 'chart_type', 'data', 'x_field', 'y_field'],
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
  ): Promise<{ action: AIAction; output: any }> {
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
          action: null as any,
          output: { holdings: data || [] },
        };
      }

      case 'get_holding_details': {
        const { data } = await this.supabase
          .from('holdings')
          .select('*, metric_facts(*), holding_widgets(*)')
          .eq('id', args.holding_id)
          .single();

        // This is read-only, no action logged
        return {
          action: null as any,
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
          action: null as any,
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

      case 'generate_d3_chart': {
        // Transform the chart parameters into a d3_json widget config
        const d3Config = {
          d3: {
            kind: args.chart_type,
            data: args.data,
            encoding: {
              x: args.x_field,
              y: args.y_field,
              ...(args.series_field && { series: args.series_field }),
            },
            options: {
              ...(args.x_type === 'time' && { xType: 'time' }),
              ...(args.color && { fill: args.color, stroke: args.color }),
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

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  /**
   * Get portfolio context for the AI
   */
  private async getPortfolioContext(portfolioId: string) {
    const [holdings, metrics, portfolioWidgets, kpiDefs] = await Promise.all([
      this.supabase
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated')
        .eq('portfolio_id', portfolioId),
      this.supabase
        .from('metrics')
        .select('code, name, unit'),
      this.supabase
        .from('widgets')
        .select('id, type, title')
        .eq('portfolio_id', portfolioId)
        .order('position', { ascending: true }),
      this.supabase
        .from('kpi_definitions')
        .select('metric_code')
        .eq('portfolio_id', portfolioId),
    ]);

    return {
      holdings: holdings.data || [],
      availableMetrics: [
        ...(metrics.data || []),
        ...(kpiDefs.data || []).map((k: any) => ({ code: k.metric_code }))
      ],
      widgets: portfolioWidgets.data || [],
    };
  }

  /**
   * Build system prompt for the AI
   */
  private buildSystemPrompt(context: any): string {
    return `You are Ben, a friendly AI portfolio management assistant and data visualization expert. You help users manage their impact investment portfolio and create compelling visualizations.

⚠️ CRITICAL: You MUST use function calls to display visualizations. NEVER use markdown images, placeholders, or text descriptions as substitutes for actual widget displays. When users ask to see/show/display something, call the appropriate function (display_widget, create_portfolio_widget, etc).

Current Portfolio Context:
- Holdings: ${context.holdings.length} total
${context.holdings.slice(0, 5).map((h: any) => `  • ${h.name} (ID: ${h.id}) - ${h.sector || 'N/A'}: $${h.funds_allocated || 0}`).join('\n')}

Available Metrics: ${context.availableMetrics.length > 0 ? context.availableMetrics.map((m: any) => m.code || m.metric_code).filter(Boolean).join(', ') : 'None defined yet - use standard codes like RENEWABLE_MWH, CLIENTS_SERVED, CO2_AVOIDED, etc.'}
${context.widgets.length > 0 ? `\nExisting Widgets: ${context.widgets.length} total\n${context.widgets.slice(0, 10).map((w: any) => `  • "${w.title}" (${w.type}) - ID: ${w.id}`).join('\n')}` : '\nExisting Widgets: None yet'}

Your capabilities:
1. Add, update, or remove holdings
2. Add metric facts (KPIs) to holdings
3. Create visualization widgets - BOTH holding-level AND portfolio-level
4. List and show existing widgets
5. Generate custom D3 charts from data
6. Add geographic locations to holdings
7. Answer questions about the portfolio

VISUALIZATION CAPABILITIES:

Portfolio-Level Widgets (use create_portfolio_widget):
- kpi_trend: Line chart tracking metrics over time (requires: metric_code, optional: period.window)
- radial_progress: Circular progress indicators (requires: rings array with metric_code, target)
- people_grid_auto: Icon grid showing people helped (requires: metric_code, perUnit, optional: target)
- holdings_pie_auto: Donut chart of portfolio allocation (auto-fetches holdings data)
- emissions_bar: Bar chart for emissions comparison (requires: series array)
- d3_json: Custom D3 visualization (requires: full d3 config)

Holding-Level Widgets (use create_widget):
- Same types as above, but attached to a specific holding (requires: holding_id)

Custom Charts (use generate_d3_chart):
When users request custom visualizations not covered by standard types, use this to:
- Fetch relevant data from portfolio/holdings
- Transform into chart-ready format
- Generate bar, line, area, or scatter charts
- Example: "Show me renewable energy by holding" → fetch data, create bar chart

Working with Existing Widgets:
- **list_widgets**: List all widgets when users ask "what visualizations do I have?"
- **display_widget**: Show an existing widget inline when users ask to see/show/display it

CRITICAL RULES FOR VISUALIZATIONS:

1. **NEVER use markdown images or placeholders** - You MUST use function calls to display widgets
   - ❌ WRONG: "![Widget Title](#)" or describing the widget
   - ✅ CORRECT: Call display_widget(widget_id) function

2. When user asks to see/show/display an EXISTING widget:
   **REQUIRED STEPS:**
   a) Look at the "Existing Widgets" section in the context above - widget IDs are listed there
   b) Identify the requested widget by title/type
   c) Call display_widget(widget_id) with the exact widget ID from the context
   d) Tell user "I'm displaying the [widget title] widget below:"

   Example flow:
   - User: "Show me the radial progress widget"
   - You: Look at context → find "KPI Progress" (radial_progress) - ID: abc-123
   - You: Call display_widget(widget_id: "abc-123")
   - You: Respond "I'm displaying the KPI Progress widget below:"
   - System: Widget appears inline automatically

   Note: Widget IDs are provided in the context. You do NOT need to call list_widgets first.

3. When user asks to CREATE a new visualization:

   **STEP-BY-STEP PROCESS:**
   a) Identify what type of widget is needed:
      - Time-series trend? → kpi_trend
      - Progress to goal? → radial_progress
      - People/impact count? → people_grid_auto
      - Portfolio breakdown? → holdings_pie_auto
      - Custom chart with specific data? → generate_d3_chart

   b) Gather required information:
      - For metric-based widgets: Check Available Metrics list above
      - If metric not listed, you can still use it (e.g., RENEWABLE_MWH, CLIENTS_SERVED)
      - For holdings_pie_auto: No metric needed, it fetches holdings automatically

   c) Build COMPLETE config with ALL required fields:
      - DON'T skip required fields like metric_code, perUnit, mode, rings, target
      - Use the exact config structure from examples above
      - Include reasonable defaults (e.g., perUnit: 100, window: "12m", mode: "sum")

   d) Choose the right function:
      - Portfolio-wide widget: create_portfolio_widget(type, title, config)
      - Holding-specific: create_widget(holding_id, type, title, config)
      - Custom D3 chart: generate_d3_chart(title, chart_type, data, x_field, y_field)

   e) Call the function with proper parameters

4. IMPORTANT: Preview mode and saving behavior
   - NEW widgets created with create_portfolio_widget/generate_d3_chart are PREVIEWS ONLY
   - Preview widgets appear inline but are NOT automatically saved to the dashboard
   - Users must click "Save to Dashboard" button to persist them
   - Tell users: "I've created a preview visualization below. If you like it, click 'Save to Dashboard' to add it permanently."
   - EXISTING widgets displayed with display_widget are already saved (no save button needed)

5. Widget rendering
   - After calling display_widget/create_portfolio_widget, the widget renders inline
   - You don't need to describe what it looks like or use markdown
   - Just explain what the widget shows and that it will appear below your message

6. COMPLETE Config examples - ALWAYS include ALL required fields:

   **kpi_trend** (Line chart of metric over time):
   {
     "metric_code": "RENEWABLE_MWH",  // REQUIRED: metric to track
     "period": { "window": "12m" },   // Optional: 3m, 6m, 12m, 24m, all
     "style": { "smooth": true }      // Optional: curved lines
   }

   **radial_progress** (Circular progress indicators):
   {
     "rings": [                        // REQUIRED: array of rings
       {
         "metric_code": "CLIENTS_SERVED",  // REQUIRED: metric
         "target": 100000,                 // REQUIRED: goal value
         "label": "People Served",         // Optional: display label
         "unit": "people",                 // Optional: unit text
         "color": "#3b82f6"                // Optional: hex color
       }
     ]
   }

   **people_grid_auto** (Icon grid showing people/impact):
   {
     "metric_code": "CLIENTS_SERVED",  // REQUIRED: metric to fetch
     "perUnit": 100,                   // REQUIRED: people per icon (e.g., 100 people = 1 icon)
     "mode": "sum",                    // REQUIRED: "sum" or "latest"
     "window": "12m",                  // Optional: time window
     "iconSize": 16,                   // Optional: icon size in pixels
     "target": 50000,                  // Optional: goal value
     "color": "var(--azure)"           // Optional: custom color
   }

   **holdings_pie_auto** (Donut chart of portfolio breakdown):
   {
     "size": 320,                      // Optional: chart size in pixels
     "innerRadius": 48,                // Optional: 0=pie, >0=donut
     "showLegend": true,               // Optional: show legend
     "legendMaxHeight": 240,           // Optional: max legend height
     "valueFieldPrimary": "funds_allocated",  // Optional: which field to show
     "valueFieldFallback": "nav"       // Optional: fallback field
   }
   NOTE: This widget auto-fetches holdings data - NO metric_code needed!

   **d3_json** (Custom D3 chart - for generate_d3_chart function):
   IMPORTANT: Use generate_d3_chart function, NOT create_portfolio_widget for custom charts!

7. COMMON REQUEST EXAMPLES - Learn from these:

   User: "Show me a pie chart of my holdings"
   → create_portfolio_widget with type="holdings_pie_auto", config={"size": 320, "innerRadius": 48, "showLegend": true}

   User: "Show renewable energy trends"
   → create_portfolio_widget with type="kpi_trend", config={"metric_code": "RENEWABLE_MWH", "period": {"window": "12m"}}

   User: "How many clients have we served?"
   → create_portfolio_widget with type="people_grid_auto", config={"metric_code": "CLIENTS_SERVED", "perUnit": 100, "mode": "sum", "window": "12m"}

   User: "Show progress toward our 50,000 client goal"
   → create_portfolio_widget with type="radial_progress", config={"rings": [{"metric_code": "CLIENTS_SERVED", "target": 50000, "label": "Clients Served"}]}

   User: "Create a bar chart of funds by sector"
   → generate_d3_chart with chart_type="bar", data=[holdings with sector/funds], x_field="sector", y_field="funds_allocated"

When the user asks you to make changes:
1. Use the provided tools to execute actions
2. Be concise and clear in your responses
3. Explain what you're creating and why
4. Offer to show existing visualizations when relevant
5. Ask for confirmation on destructive actions (deletes)
6. Suggest related visualizations when appropriate

Be helpful, professional, conversational, and focused on creating insightful visualizations for impact investing.`;
  }
}
