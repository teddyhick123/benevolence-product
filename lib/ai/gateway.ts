import type {
  AIConnector,
  AIExecutionPlan,
  AIExecutionScope,
  AIGenerationRequest,
  AIInvocationRecord,
  AIInvocationRecorder,
  AIStructuredResult,
  AITextResult,
  AITranscriptionRequest,
  AITranscriptionResult,
  AIToolConversationRequest,
  AIUsage,
} from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import type { AIResponse, AIStreamChunk } from '@/lib/ai/types';
import type { AIOperation, AIWorkloadId } from '@/lib/ai/workloads';
import { resolveAIExecution } from '@/lib/ai/resolver';

type GatewayDependencies = {
  connector: (_plan: AIExecutionPlan) => AIConnector;
  recorder: AIInvocationRecorder;
  onRecorderError?: (_error: unknown) => void;
  now?: () => number;
};

type InvocationMetadata = {
  resolvedModel?: string;
  providerRequestId?: string;
  usage?: AIUsage;
};

function reportRecorderError(error: unknown) {
  process.emitWarning(error instanceof Error ? error : String(error));
}

function normalizeError(error: unknown, timedOut: boolean): AIExecutionError {
  if (timedOut) return new AIExecutionError('timeout', 'AI request timed out', { cause: error });
  if (error instanceof AIExecutionError) return error;
  if (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError'
  ) {
    return new AIExecutionError('aborted', 'AI request was aborted', { cause: error });
  }
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) {
    return new AIExecutionError('credential_invalid', 'AI connection authentication failed', { cause: error });
  }
  if (status === 429) {
    return new AIExecutionError('rate_limited', 'AI provider rate limit exceeded', { cause: error });
  }
  return new AIExecutionError('provider_error', 'AI provider request failed', { cause: error });
}

function responseMetadata(response: AIResponse): InvocationMetadata {
  return {
    resolvedModel: response.model,
    providerRequestId: response.providerRequestId,
    usage: response.usage,
  };
}

export class AIExecutionGateway {
  private readonly now: () => number;
  private readonly scope: AIExecutionScope;

  constructor(
    scope: AIExecutionScope,
    private readonly dependencies: GatewayDependencies,
  ) {
    this.scope = scope;
    this.now = dependencies.now ?? Date.now;
  }

  resolve(workloadId: AIWorkloadId): AIExecutionPlan {
    return resolveAIExecution(this.scope, workloadId);
  }

  private requireOperation(plan: AIExecutionPlan, allowed: AIOperation[]) {
    if (!allowed.includes(plan.operation)) {
      throw new AIExecutionError(
        'capability_mismatch',
        `Workload ${plan.workloadId} does not support this AI operation`,
      );
    }
    const connector = this.dependencies.connector(plan);
    const missing = plan.requiredCapabilities.filter(
      (capability) => !connector.capabilities.includes(capability),
    );
    if (missing.length > 0) {
      throw new AIExecutionError(
        'capability_mismatch',
        `Connector ${connector.id} is missing: ${missing.join(', ')}`,
      );
    }
    return connector;
  }

  private async record(record: AIInvocationRecord) {
    try {
      await this.dependencies.recorder(record);
    } catch (error) {
      (this.dependencies.onRecorderError ?? reportRecorderError)(error);
    }
  }

  private async invoke<T>(
    plan: AIExecutionPlan,
    externalSignal: AbortSignal | undefined,
    execute: (_connector: AIConnector, _signal: AbortSignal) => Promise<T>,
    metadata: (_result: T) => InvocationMetadata,
    allowedOperations: AIOperation[],
  ): Promise<T> {
    const connector = this.requireOperation(plan, allowedOperations);
    const started = this.now();
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, plan.timeoutMs);
    let invocationMetadata: InvocationMetadata = {};
    let failure: AIExecutionError | null = null;

    try {
      const result = await execute(connector, controller.signal);
      invocationMetadata = metadata(result);
      return result;
    } catch (error) {
      failure = normalizeError(error, timedOut);
      throw failure;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
      const completed = this.now();
      await this.record({
        id: crypto.randomUUID(),
        workloadId: plan.workloadId,
        operation: plan.operation,
        scope: this.scope,
        connector: plan.connector,
        requestedModel: plan.requestedModel,
        ...invocationMetadata,
        startedAt: new Date(started).toISOString(),
        completedAt: new Date(completed).toISOString(),
        latencyMs: Math.max(0, completed - started),
        status: failure
          ? failure.code === 'timeout'
            ? 'timed_out'
            : failure.code === 'aborted'
              ? 'aborted'
              : 'failed'
          : 'succeeded',
        ...(failure ? { errorCode: failure.code } : {}),
      });
    }
  }

  generateText(plan: AIExecutionPlan, request: AIGenerationRequest): Promise<AITextResult> {
    return this.invoke(
      plan,
      request.signal,
      (connector, signal) => {
        if (!connector.generateText) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot generate text');
        }
        return connector.generateText(plan, { ...request, signal });
      },
      (result) => responseMetadata(result.response),
      ['text_generation', 'structured_generation'],
    );
  }

  generateStructured<T>(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    parse: (_text: string) => T,
  ): Promise<AIStructuredResult<T>> {
    return this.invoke(
      plan,
      request.signal,
      (connector, signal) => {
        if (!connector.generateStructured) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot generate structured output');
        }
        return connector.generateStructured(plan, { ...request, signal }, parse);
      },
      (result) => responseMetadata(result.response),
      ['structured_generation'],
    );
  }

  runToolConversation(
    plan: AIExecutionPlan,
    request: AIToolConversationRequest,
  ): Promise<AIResponse> {
    return this.invoke(
      plan,
      request.signal,
      (connector, signal) => {
        if (!connector.runToolConversation) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot run tool conversations');
        }
        return connector.runToolConversation(plan, { ...request, signal });
      },
      responseMetadata,
      ['tool_conversation'],
    );
  }

  streamText(plan: AIExecutionPlan, request: AIGenerationRequest): AsyncIterable<AIStreamChunk> {
    return this.stream(plan, request, ['text_generation'], (connector, signal) => {
      if (!connector.streamText) {
        throw new AIExecutionError('capability_mismatch', 'Connector cannot stream text');
      }
      return connector.streamText(plan, { ...request, signal });
    });
  }

  streamToolConversation(
    plan: AIExecutionPlan,
    request: AIToolConversationRequest,
  ): AsyncIterable<AIStreamChunk> {
    return this.stream(plan, request, ['tool_conversation'], (connector, signal) => {
      if (!connector.streamToolConversation) {
        throw new AIExecutionError('capability_mismatch', 'Connector cannot stream tool conversations');
      }
      return connector.streamToolConversation(plan, { ...request, signal });
    });
  }

  private async *stream(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    allowedOperations: AIOperation[],
    createStream: (_connector: AIConnector, _signal: AbortSignal) => AsyncIterable<AIStreamChunk>,
  ): AsyncIterable<AIStreamChunk> {
    const connector = this.requireOperation(plan, allowedOperations);
    const started = this.now();
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) abort();
    else request.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, plan.timeoutMs);
    let metadata: InvocationMetadata = {};
    let failure: AIExecutionError | null = null;
    let streamCompleted = false;

    try {
      for await (const chunk of createStream(connector, controller.signal)) {
        if (chunk.type === 'message_start') {
          metadata = {
            ...metadata,
            resolvedModel: chunk.model,
            providerRequestId: chunk.providerRequestId,
            usage: chunk.usage,
          };
        } else if (chunk.type === 'message_stop') {
          metadata = {
            ...metadata,
            resolvedModel: chunk.model ?? metadata.resolvedModel,
            providerRequestId: chunk.providerRequestId ?? metadata.providerRequestId,
            usage: {
              inputTokens: metadata.usage?.inputTokens ?? chunk.usage?.inputTokens ?? 0,
              outputTokens: chunk.usage?.outputTokens ?? metadata.usage?.outputTokens ?? 0,
            },
          };
        }
        yield chunk;
      }
      streamCompleted = true;
    } catch (error) {
      failure = normalizeError(error, timedOut);
      throw failure;
    } finally {
      if (!streamCompleted && !failure) {
        failure = new AIExecutionError('aborted', 'AI stream was closed before completion');
      }
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
      const completed = this.now();
      await this.record({
        id: crypto.randomUUID(),
        workloadId: plan.workloadId,
        operation: plan.operation,
        scope: this.scope,
        connector: plan.connector,
        requestedModel: plan.requestedModel,
        ...metadata,
        startedAt: new Date(started).toISOString(),
        completedAt: new Date(completed).toISOString(),
        latencyMs: Math.max(0, completed - started),
        status: failure
          ? failure.code === 'timeout'
            ? 'timed_out'
            : failure.code === 'aborted'
              ? 'aborted'
              : 'failed'
          : 'succeeded',
        ...(failure ? { errorCode: failure.code } : {}),
      });
    }
  }

  transcribe(
    plan: AIExecutionPlan,
    request: AITranscriptionRequest,
  ): Promise<AITranscriptionResult> {
    return this.invoke(
      plan,
      request.signal,
      (connector, signal) => {
        if (!connector.transcribe) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot transcribe audio');
        }
        return connector.transcribe(plan, { ...request, signal });
      },
      (result) => ({
        resolvedModel: result.model,
        providerRequestId: result.providerRequestId,
        usage: result.usage,
      }),
      ['transcription'],
    );
  }
}
