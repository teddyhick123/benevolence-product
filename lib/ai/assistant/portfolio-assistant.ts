import type { SupabaseClient } from '@/lib/database-client';
import {
  ModuleId,
  filterToolsForOrg,
  getOrgEnabledModules,
  getSystemPromptForModules,
} from '@/lib/modules';
import { createAIExecutionGateway } from '@/lib/ai/runtime';
import type {
  AIAction,
  AIContentBlock,
  AIMessage,
  ToolDefinition,
  ToolResult,
} from '@/lib/ai/types';
import type { AssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';
import { getPortfolioContext } from './context';
import { executeAssistantTool } from './executor';
import { buildSystemPrompt } from './prompts';
import { PORTFOLIO_TOOLS } from './tool-definitions';

export class PortfolioAssistant {
  private aiInstructions: string | null = null;
  private supabase: SupabaseClient;
  private enabledModules: ModuleId[] = ['core'];
  private moduleSystemPrompt: string = '';
  private capabilities: AssistantToolCapabilities;

  constructor(
    services: {
      db: SupabaseClient;
      capabilities: AssistantToolCapabilities;
    },
    _apiKey?: string,
  ) {
    this.supabase = services.db;
    this.capabilities = services.capabilities;
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
    this.aiInstructions =
      (orgRes.data as { ai_instructions?: string | null } | null)
        ?.ai_instructions ?? null;
  }

  private getFilteredTools(): ToolDefinition[] {
    return filterToolsForOrg(PORTFOLIO_TOOLS, this.enabledModules);
  }

  resetToDefault(): void {
    this.enabledModules = ['core'];
    this.moduleSystemPrompt = '';
  }

  async chat(params: {
    portfolioId: string;
    userId: string;
    sessionId: string;
    turnId?: string;
    message: string;
    orgId?: string;
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
    memberRole?: string;
  }) {
    const {
      portfolioId,
      userId,
      sessionId,
      turnId,
      message,
      orgId,
      conversationHistory = [],
      memberRole,
    } = params;

    // Initialize for organization if provided (enables module filtering)
    if (orgId) {
      await this.initializeForOrg(orgId);
    }

    // Get filtered tools based on enabled modules
    const tools = this.getFilteredTools();

    // Get portfolio context
    const context = await getPortfolioContext(this.supabase, portfolioId);

    // Build system prompt with module-specific additions
    const systemPrompt = buildSystemPrompt(context, {
      moduleSystemPrompt: this.moduleSystemPrompt,
      aiInstructions: this.aiInstructions,
    });

    // Build mutable message history for multi-turn tool execution
    const currentMessages: AIMessage[] = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Multi-turn tool execution loop — continues until end_turn or max 5 iterations
    const actions: AIAction[] = [];
    const allToolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }> = [];
    const allToolResults: Array<{ tool_use_id: string; content: string }> = [];
    let textContent = '';
    const batchId = turnId ?? crypto.randomUUID();
    let sequenceCounter = 0;
    const MAX_TURNS = 5;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const gateway = createAIExecutionGateway({
      kind: orgId ? 'organization' : 'platform',
      orgId,
      actorId: userId,
      portfolioId,
      sessionId,
      turnId,
    });
    const executionPlan = gateway.resolve('assistant');
    let lastModel = executionPlan.requestedModel;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await gateway.runToolConversation(executionPlan, {
        maxOutputTokens: 4096,
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
        (block): block is AIContentBlock & { type: 'text' } =>
          block.type === 'text',
      );
      const turnText = textBlocks.map((b) => b.text).join('');
      if (turnText) textContent = turnText;

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is AIContentBlock & { type: 'tool_use' } =>
          block.type === 'tool_use',
      );

      // No tool use or end_turn — we're done
      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') {
        break;
      }

      // Execute tools for this turn
      const turnToolResults: Array<{ tool_use_id: string; content: string }> =
        [];
      for (const toolUse of toolUseBlocks) {
        allToolCalls.push({
          id: toolUse.id,
          type: 'function',
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input),
          },
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
            orgId,
            memberRole,
          );
          if (result.action) actions.push(result.action);
          if (result.additionalActions)
            actions.push(...result.additionalActions);
          const toolResult = {
            tool_use_id: toolUse.id,
            content: JSON.stringify(result.output),
          };
          turnToolResults.push(toolResult);
          allToolResults.push(toolResult);
        } catch (error) {
          const toolResult = {
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (error as Error).message }),
          };
          turnToolResults.push(toolResult);
          allToolResults.push(toolResult);
        }
      }

      // Extend message history for next turn
      currentMessages.push(
        { role: 'assistant' as const, content: response.content },
        {
          role: 'user' as const,
          content: turnToolResults.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.tool_use_id,
            content: tr.content,
          })) as AIContentBlock[],
        },
      );
    }

    return {
      message: textContent,
      actions,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        model: lastModel,
      },
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
    turnId?: string;
    message: string;
    orgId?: string;
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
    memberRole?: string;
  }): AsyncGenerator<string> {
    const {
      portfolioId,
      userId,
      sessionId,
      turnId,
      message,
      orgId,
      conversationHistory = [],
      memberRole,
    } = params;

    if (orgId) await this.initializeForOrg(orgId);
    const tools = this.getFilteredTools();
    const context = await getPortfolioContext(this.supabase, portfolioId);
    const systemPrompt = buildSystemPrompt(context, {
      moduleSystemPrompt: this.moduleSystemPrompt,
      aiInstructions: this.aiInstructions,
    });

    const currentMessages: AIMessage[] = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const actions: AIAction[] = [];
    let textContent = '';
    const batchId = turnId ?? crypto.randomUUID();
    let sequenceCounter = 0;
    const MAX_TURNS = 5;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const gateway = createAIExecutionGateway({
      kind: orgId ? 'organization' : 'platform',
      orgId,
      actorId: userId,
      portfolioId,
      sessionId,
      turnId,
    });
    const executionPlan = gateway.resolve('assistant');
    let lastModel = executionPlan.requestedModel;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let turnTextContent = '';
      const toolUseBlocks: Array<{
        id: string;
        name: string;
        input: Record<string, any>;
      }> = [];
      let stopReason: string | null = null;

      // Use createStream so text tokens arrive as they're generated
      const stream = gateway.streamToolConversation(executionPlan, {
        maxOutputTokens: 4096,
        system: systemPrompt,
        tools: tools as unknown as ToolDefinition[],
        messages: currentMessages,
      });

      let currentToolId: string | null = null;
      let currentToolName: string | null = null;
      let currentToolInputJson = '';

      for await (const chunk of stream) {
        if (chunk.type === 'message_start') {
          lastModel = chunk.model;
          totalInputTokens += chunk.usage?.inputTokens ?? 0;
          totalOutputTokens += chunk.usage?.outputTokens ?? 0;
        } else if (chunk.type === 'content_block_start') {
          if (chunk.blockType === 'tool_use') {
            currentToolId = chunk.id ?? null;
            currentToolName = chunk.name ?? null;
            currentToolInputJson = '';
            // Yield status update when entering tool calling
            if (actions.length === 0 && toolUseBlocks.length === 0) {
              yield JSON.stringify({ type: 'status', text: 'Calling tools…' }) +
                '\n';
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
            try {
              input = JSON.parse(currentToolInputJson);
            } catch {}
            toolUseBlocks.push({
              id: currentToolId,
              name: currentToolName,
              input,
            });
            currentToolId = null;
            currentToolName = null;
            currentToolInputJson = '';
          }
        } else if (chunk.type === 'message_stop') {
          stopReason = chunk.stopReason;
          if (chunk.model) lastModel = chunk.model;
          totalOutputTokens += chunk.usage?.outputTokens ?? 0;
        }
      }

      if (turnTextContent) textContent = turnTextContent;

      // No tools or not tool_use stop — done
      if (toolUseBlocks.length === 0 || stopReason !== 'tool_use') {
        break;
      }

      // Yield status before executing tools
      yield JSON.stringify({ type: 'status', text: 'Processing results…' }) +
        '\n';

      // Execute tools (same logic as chat())
      const turnToolResults: Array<{ tool_use_id: string; content: string }> =
        [];
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
            orgId,
            memberRole,
          );
          if (result.action) actions.push(result.action);
          if (result.additionalActions)
            actions.push(...result.additionalActions);
          const toolContent =
            typeof result.output === 'string'
              ? result.output
              : JSON.stringify(result.output);
          turnToolResults.push({
            tool_use_id: toolUse.id,
            content: toolContent,
          });
        } catch (err) {
          turnToolResults.push({
            tool_use_id: toolUse.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // Append assistant message (with tool calls) + tool results to history
      currentMessages.push({
        role: 'assistant',
        content: [
          ...(turnTextContent
            ? [{ type: 'text' as const, text: turnTextContent }]
            : []),
          ...toolUseBlocks.map((t) => ({
            type: 'tool_use' as const,
            id: t.id,
            name: t.name,
            input: t.input,
          })),
        ],
      });
      currentMessages.push({
        role: 'user',
        content: turnToolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });
    }

    // Yield the done event with all metadata
    yield JSON.stringify({
      type: 'done',
      message: textContent,
      actions,
      toolResults: [],
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        model: lastModel,
      },
    }) + '\n';
  }

  private async executeTool(
    functionName: string,
    args: Record<string, unknown>,
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    orgId?: string,
    memberRole?: string,
  ): Promise<ToolResult> {
    return executeAssistantTool({
      db: this.supabase,
      functionName,
      args,
      portfolioId,
      orgId,
      userId,
      sessionId,
      batchId,
      sequenceOrder,
      userPrompt,
      capabilities: this.capabilities,
      memberRole,
    });
  }
}
