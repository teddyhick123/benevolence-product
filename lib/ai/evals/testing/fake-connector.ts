import type {
  AIConnector,
  AIExecutionPlan,
  AIGenerationRequest,
  AIToolConversationRequest,
  AITextResult,
} from '@/lib/ai/execution';
import type { AIResponse, AIStreamChunk } from '@/lib/ai/types';
import type { AICapability, AIConnectorId } from '@/lib/ai/workloads';

export type FakeScript = {
  /** Consumed in order, one entry per model call. */
  responses: AIResponse[];
  /** Chunks yielded by streaming calls. Defaults to two text deltas. */
  chunks?: AIStreamChunk[];
  /** When set, every call rejects with this error. */
  failWith?: Error;
};

/**
 * Scripted connector for evaluating the evaluator. Records every plan and
 * request so tests can assert what the driver asked the model to do.
 */
export class FakeConnector implements AIConnector {
  readonly id = 'openrouter' as const satisfies AIConnectorId;
  readonly capabilities: readonly AICapability[] =
    ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'];

  readonly calls: Array<{ plan: AIExecutionPlan; request: AIGenerationRequest }> = [];
  private index = 0;

  constructor(private readonly script: FakeScript) {}

  private next(plan: AIExecutionPlan, request: AIGenerationRequest): AIResponse {
    if (this.script.failWith) throw this.script.failWith;
    this.calls.push({ plan, request });
    const response = this.script.responses[Math.min(this.index, this.script.responses.length - 1)];
    this.index += 1;
    return response;
  }

  private static textOf(response: AIResponse): string {
    return response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  async generateText(plan: AIExecutionPlan, request: AIGenerationRequest): Promise<AITextResult> {
    const response = this.next(plan, request);
    return { text: FakeConnector.textOf(response), response };
  }

  async generateStructured<T>(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    parse: (_text: string) => T,
  ) {
    const result = await this.generateText(plan, request);
    return { ...result, value: parse(result.text) };
  }

  async runToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest) {
    return this.next(plan, request);
  }

  async *streamText(plan: AIExecutionPlan, request: AIGenerationRequest): AsyncIterable<AIStreamChunk> {
    const response = this.next(plan, request);
    const text = FakeConnector.textOf(response);
    const chunks: AIStreamChunk[] = this.script.chunks ?? [
      { type: 'message_start', model: response.model },
      { type: 'text_delta', text: text.slice(0, 1) },
      { type: 'text_delta', text: text.slice(1) },
      { type: 'message_stop', stopReason: response.stopReason, model: response.model },
    ];
    for (const chunk of chunks) yield chunk;
  }
}
