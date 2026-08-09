import type {
  AIConnector,
  AIExecutionPlan,
  AIGenerationRequest,
  AIToolConversationRequest,
  AIUsage,
} from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import type { AIContentBlock, AIMessage, AIResponse, AIStreamChunk, ToolDefinition } from '@/lib/ai/types';
import {
  openRouterCredentialSchema,
  openRouterProviderPreferencesSchema,
} from '@/lib/schemas/ai-settings';
import type { z } from 'zod';

const OPENROUTER_API_ORIGIN = 'https://openrouter.ai/api/v1';

type ProviderPreferences = z.infer<typeof openRouterProviderPreferencesSchema>;

export type OpenRouterConnectorOptions = {
  apiKey: string;
  provider?: ProviderPreferences;
  fetch?: typeof fetch;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; audio_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number; audio_tokens?: number };
};

type OpenRouterToolCall = {
  id?: string;
  index?: number;
  function?: { name?: string; arguments?: string };
};

type OpenRouterResponse = {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
  }>;
  usage?: OpenRouterUsage;
  error?: { code?: number | string };
};

function usage(value: OpenRouterUsage | undefined): AIUsage | undefined {
  if (!value) return undefined;
  return {
    inputTokens: value.prompt_tokens ?? 0,
    outputTokens: value.completion_tokens ?? 0,
    cachedInputTokens: value.prompt_tokens_details?.cached_tokens,
    reasoningTokens: value.completion_tokens_details?.reasoning_tokens,
    audioInputTokens: value.prompt_tokens_details?.audio_tokens,
    audioOutputTokens: value.completion_tokens_details?.audio_tokens,
  };
}

function stopReason(reason: string | null | undefined): string | null {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'stop') return 'end_turn';
  if (reason === 'length') return 'max_tokens';
  return reason ?? null;
}

function normalizedError(status: number): AIExecutionError {
  if (status === 401 || status === 403) {
    return new AIExecutionError('credential_invalid', 'AI connection authentication failed');
  }
  if (status === 402) return new AIExecutionError('credit_exhausted', 'AI connection credit is exhausted');
  if (status === 408) return new AIExecutionError('timeout', 'AI provider request timed out');
  if (status === 429) return new AIExecutionError('rate_limited', 'AI provider rate limit exceeded');
  if (status === 502 || status === 503) {
    return new AIExecutionError('deployment_unavailable', 'AI deployment is unavailable');
  }
  return new AIExecutionError('provider_error', 'AI provider request failed');
}

function toolDefinitions(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function parseToolInput(input: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(input ?? '{}') as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Invalid tool JSON is a provider contract failure, never exposed verbatim.
  }
  throw new AIExecutionError('provider_error', 'AI provider returned invalid tool input');
}

function messages(system: string | undefined, input: AIMessage[]) {
  const result: Array<Record<string, unknown>> = [];
  if (system) result.push({ role: 'system', content: system });
  for (const message of input) {
    if (typeof message.content === 'string') {
      result.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      const text = message.content
        .filter((block): block is Extract<AIContentBlock, { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('');
      const calls = message.content
        .filter((block): block is Extract<AIContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
        .map(block => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        }));
      result.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }
    const text = message.content
      .filter((block): block is Extract<AIContentBlock, { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('');
    if (text) result.push({ role: 'user', content: text });
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        result.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
      }
    }
  }
  return result;
}

export class OpenRouterConnector implements AIConnector {
  readonly id = 'openrouter' as const;
  readonly capabilities = ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'] as const;
  private readonly apiKey: string;
  private readonly provider?: ProviderPreferences;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenRouterConnectorOptions) {
    this.apiKey = openRouterCredentialSchema.parse({ apiKey: options.apiKey }).apiKey;
    this.provider = options.provider
      ? openRouterProviderPreferencesSchema.parse(options.provider)
      : undefined;
    this.fetcher = options.fetch ?? fetch;
  }

  private payload(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    tools?: ToolDefinition[],
    stream = false,
  ) {
    return {
      model: plan.requestedModel,
      messages: messages(request.system, request.messages),
      max_tokens: Math.min(request.maxOutputTokens ?? plan.maxOutputTokens, plan.maxOutputTokens),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(tools ? { tools: toolDefinitions(tools) } : {}),
      ...(request.responseFormat ? {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.responseFormat.name,
            strict: true,
            schema: request.responseFormat.schema,
          },
        },
      } : {}),
      provider: {
        ...(this.provider ?? {}),
        allow_fallbacks: false,
      },
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }

  private async send(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(`${OPENROUTER_API_ORIGIN}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof AIExecutionError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new AIExecutionError('deployment_unavailable', 'AI deployment is unavailable');
    }
    if (!response.ok) throw normalizedError(response.status);
    return response;
  }

  private async complete(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const response = await this.send(this.payload(plan, request, tools), request.signal);
    let value: OpenRouterResponse;
    try {
      value = await response.json() as OpenRouterResponse;
    } catch {
      throw new AIExecutionError('provider_error', 'AI provider returned an invalid response');
    }
    if (value.error) throw normalizedError(Number(value.error.code) || 500);
    const choice = value.choices?.[0];
    if (!choice?.message) throw new AIExecutionError('provider_error', 'AI provider returned no response');
    const content: AIContentBlock[] = [];
    if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
    for (const call of choice.message.tool_calls ?? []) {
      content.push({
        type: 'tool_use',
        id: call.id ?? crypto.randomUUID(),
        name: call.function?.name ?? '',
        input: parseToolInput(call.function?.arguments),
      });
    }
    return {
      content,
      stopReason: stopReason(choice.finish_reason),
      model: value.model ?? plan.requestedModel,
      providerRequestId: value.id,
      resolvedProvider: value.provider,
      usage: usage(value.usage),
    };
  }

  async generateText(plan: AIExecutionPlan, request: AIGenerationRequest) {
    const response = await this.complete(plan, request);
    const text = response.content
      .filter((block): block is Extract<AIContentBlock, { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('');
    return { text, response };
  }

  async generateStructured<T>(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    parse: (_text: string) => T,
  ) {
    const result = await this.generateText(plan, {
      ...request,
      responseFormat: request.responseFormat ?? {
        name: 'structured_response',
        schema: { type: 'object', additionalProperties: true },
      },
    });
    return { ...result, value: parse(result.text) };
  }

  runToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest) {
    return this.complete(plan, request, request.tools);
  }

  streamText(plan: AIExecutionPlan, request: AIGenerationRequest) {
    return this.stream(plan, request);
  }

  streamToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest) {
    return this.stream(plan, request, request.tools);
  }

  private async *stream(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    tools?: ToolDefinition[],
  ): AsyncIterable<AIStreamChunk> {
    const response = await this.send(this.payload(plan, request, tools, true), request.signal);
    if (!response.body) throw new AIExecutionError('provider_error', 'AI provider returned no stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let started = false;
    let currentBlock: 'text' | number | null = null;
    let finalReason: string | null = null;
    let finalUsage: AIUsage | undefined;
    let model = plan.requestedModel;
    let requestId: string | undefined;
    let resolvedProvider: string | undefined;

    const parseEvent = (line: string): OpenRouterResponse | null => {
      if (!line.startsWith('data:')) return null;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return null;
      try {
        return JSON.parse(data) as OpenRouterResponse;
      } catch {
        throw new AIExecutionError('provider_error', 'AI provider returned invalid stream data');
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = done ? '' : lines.pop() ?? '';
        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;
          const event = parseEvent(line);
          if (!event) continue;
          if (event.error) throw normalizedError(Number(event.error.code) || 500);
          model = event.model ?? model;
          requestId = event.id ?? requestId;
          resolvedProvider = event.provider ?? resolvedProvider;
          if (!started) {
            started = true;
            yield {
              type: 'message_start',
              model,
              providerRequestId: requestId,
              resolvedProvider,
              usage: usage(event.usage),
            };
          }
          finalUsage = usage(event.usage) ?? finalUsage;
          const choice = event.choices?.[0] as {
            finish_reason?: string | null;
            delta?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
          } | undefined;
          if (choice?.finish_reason) finalReason = stopReason(choice.finish_reason);
          const text = choice?.delta?.content;
          if (text) {
            if (currentBlock !== 'text') {
              if (currentBlock !== null) yield { type: 'content_block_stop' };
              currentBlock = 'text';
              yield { type: 'content_block_start', blockType: 'text' };
            }
            yield { type: 'text_delta', text };
          }
          for (const call of choice?.delta?.tool_calls ?? []) {
            const index = call.index ?? 0;
            if (currentBlock !== index) {
              if (currentBlock !== null) yield { type: 'content_block_stop' };
              currentBlock = index;
              yield {
                type: 'content_block_start',
                blockType: 'tool_use',
                id: call.id,
                name: call.function?.name,
              };
            }
            if (call.function?.arguments) {
              yield { type: 'tool_input_delta', partialJson: call.function.arguments };
            }
          }
        }
        if (done) break;
      }
      if (!started) throw new AIExecutionError('provider_error', 'AI provider returned an empty stream');
      if (currentBlock !== null) yield { type: 'content_block_stop' };
      yield {
        type: 'message_stop',
        stopReason: finalReason,
        model,
        providerRequestId: requestId,
        resolvedProvider,
        usage: finalUsage,
      };
    } finally {
      reader.releaseLock();
    }
  }
}
