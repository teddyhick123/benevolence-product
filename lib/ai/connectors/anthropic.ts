import type {
  AIConnector,
  AIGenerationRequest,
  AIExecutionPlan,
  AIToolConversationRequest,
} from '@/lib/ai/execution';
import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
import { extractText } from '@/lib/ai/text';
import type { AIProvider } from '@/lib/ai/provider';

export class AnthropicConnector implements AIConnector {
  readonly id = 'anthropic' as const;
  readonly capabilities = [
    'text',
    'json',
    'tools',
    'streaming',
    'parallel_tool_results',
  ] as const;

  constructor(private readonly _provider: AIProvider = new AnthropicProvider()) {}

  async generateText(plan: AIExecutionPlan, request: AIGenerationRequest) {
    const response = await this._provider.createMessage({
      model: plan.requestedModel,
      system: request.system,
      messages: request.messages,
      maxTokens: Math.min(
        request.maxOutputTokens ?? plan.maxOutputTokens,
        plan.maxOutputTokens,
      ),
      temperature: request.temperature,
      signal: request.signal,
    });
    return { text: extractText(response), response };
  }

  async generateStructured<T>(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    parse: (_text: string) => T,
  ) {
    const result = await this.generateText(plan, request);
    return { ...result, value: parse(result.text) };
  }

  streamText(plan: AIExecutionPlan, request: AIGenerationRequest) {
    return this._provider.createStream({
      model: plan.requestedModel,
      system: request.system,
      messages: request.messages,
      maxTokens: Math.min(
        request.maxOutputTokens ?? plan.maxOutputTokens,
        plan.maxOutputTokens,
      ),
      temperature: request.temperature,
      signal: request.signal,
    });
  }

  runToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest) {
    return this._provider.createMessage({
      model: plan.requestedModel,
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      maxTokens: Math.min(
        request.maxOutputTokens ?? plan.maxOutputTokens,
        plan.maxOutputTokens,
      ),
      temperature: request.temperature,
      signal: request.signal,
    });
  }

  streamToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest) {
    return this._provider.createStream({
      model: plan.requestedModel,
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      maxTokens: Math.min(
        request.maxOutputTokens ?? plan.maxOutputTokens,
        plan.maxOutputTokens,
      ),
      temperature: request.temperature,
      signal: request.signal,
    });
  }
}
