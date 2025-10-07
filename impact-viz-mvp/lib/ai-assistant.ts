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

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  /**
   * Get portfolio context for the AI
   */
  private async getPortfolioContext(portfolioId: string) {
    const [holdings, metrics, widgets] = await Promise.all([
      this.supabase
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated')
        .eq('portfolio_id', portfolioId),
      this.supabase
        .from('metrics')
        .select('code, name, unit'),
      this.supabase
        .from('holding_widgets')
        .select('id, type, title, holding_id')
        .eq('holding_id', portfolioId),
    ]);

    return {
      holdings: holdings.data || [],
      availableMetrics: metrics.data || [],
      widgets: widgets.data || [],
    };
  }

  /**
   * Build system prompt for the AI
   */
  private buildSystemPrompt(context: any): string {
    return `You are Ben, a friendly AI portfolio management assistant. You help users manage their impact investment portfolio.

Current Portfolio Context:
- Holdings: ${context.holdings.length} total
${context.holdings.slice(0, 5).map((h: any) => `  • ${h.name} (ID: ${h.id}) - ${h.sector || 'N/A'}: $${h.funds_allocated || 0}`).join('\n')}

Available Metrics: ${context.availableMetrics.map((m: any) => m.code).join(', ')}

Your capabilities:
1. Add, update, or remove holdings
2. Add metric facts (KPIs) to holdings
3. Create visualization widgets FOR SPECIFIC HOLDINGS (not portfolio-level)
4. Add geographic locations to holdings
5. Answer questions about the portfolio

IMPORTANT: Widgets must be attached to a specific holding. When a user asks for a widget but doesn't specify which holding, you should:
- Ask them which holding they want the widget for
- OR suggest creating it for the most relevant holding based on context
- DO NOT try to create a widget without a valid holding_id

When the user asks you to make changes:
1. Use the provided tools to execute actions
2. Be concise and clear in your responses
3. Explain what you're doing and why
4. Ask for clarification when needed (e.g., which holding for widgets)
5. Ask for confirmation on destructive actions (deletes)
6. Suggest related actions when appropriate

Be helpful, professional, and focused on impact investing.`;
  }
}
