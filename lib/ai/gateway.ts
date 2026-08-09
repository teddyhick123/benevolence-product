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
import {
  resolveOrganizationAIExecution,
  selectAIExecutionTarget,
} from '@/lib/ai/resolver';

type GatewayDependencies = {
  connector: (_plan: AIExecutionPlan) => AIConnector | Promise<AIConnector>;
  recorder: AIInvocationRecorder;
  resolver?: (_scope: AIExecutionScope, _workloadId: AIWorkloadId) => Promise<AIExecutionPlan>;
  onRecorderError?: (_error: unknown) => void;
  now?: () => number;
};

type InvocationMetadata = {
  resolvedModel?: string;
  resolvedProvider?: string;
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
  if (status === 402) return new AIExecutionError('credit_exhausted', 'AI connection credit is exhausted', { cause: error });
  if (status === 408) return new AIExecutionError('timeout', 'AI request timed out', { cause: error });
  if (status === 429) {
    return new AIExecutionError('rate_limited', 'AI provider rate limit exceeded', { cause: error });
  }
  if (status === 502 || status === 503) {
    return new AIExecutionError('deployment_unavailable', 'AI deployment is unavailable', { cause: error });
  }
  return new AIExecutionError('provider_error', 'AI provider request failed', { cause: error });
}

function responseMetadata(response: AIResponse): InvocationMetadata {
  return {
    resolvedModel: response.model,
    resolvedProvider: response.resolvedProvider,
    providerRequestId: response.providerRequestId,
    usage: response.usage,
  };
}

function invocationStatus(failure: AIExecutionError | null): AIInvocationRecord['status'] {
  if (!failure) return 'succeeded';
  if (failure.code === 'timeout') return 'timed_out';
  if (failure.code === 'aborted') return 'aborted';
  return 'failed';
}

export class AIExecutionGateway {
  private readonly now: () => number;
  private readonly scope: AIExecutionScope;
  private readonly pinnedTargets = new WeakMap<AIExecutionPlan, number>();

  constructor(
    scope: AIExecutionScope,
    private readonly dependencies: GatewayDependencies,
  ) {
    this.scope = scope;
    this.now = dependencies.now ?? Date.now;
  }

  resolve(workloadId: AIWorkloadId): Promise<AIExecutionPlan> {
    return (this.dependencies.resolver ?? resolveOrganizationAIExecution)(this.scope, workloadId);
  }

  private async requireOperation(plan: AIExecutionPlan, allowed: AIOperation[]) {
    if (!allowed.includes(plan.operation)) {
      throw new AIExecutionError(
        'capability_mismatch',
        `Workload ${plan.workloadId} does not support this AI operation`,
      );
    }
    const connector = await this.dependencies.connector(plan);
    const missing = plan.requiredCapabilities.filter(
      capability => !connector.capabilities.includes(capability),
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

  private targets(plan: AIExecutionPlan) {
    const pinned = this.pinnedTargets.get(plan);
    if (pinned === undefined) return plan.targets;
    return plan.targets.filter(target => target.position === pinned);
  }

  private canFallback(plan: AIExecutionPlan, error: AIExecutionError, index: number): boolean {
    if (this.pinnedTargets.has(plan) || index >= plan.targets.length - 1) return false;
    const allowed = Array.isArray(plan.policy.fallbackOn)
      ? plan.policy.fallbackOn.filter((value): value is string => typeof value === 'string')
      : [];
    return allowed.includes(error.code);
  }

  private async recordAttempt(
    plan: AIExecutionPlan,
    started: number,
    metadata: InvocationMetadata,
    failure: AIExecutionError | null,
  ) {
    const completed = this.now();
    await this.record({
      id: crypto.randomUUID(),
      workloadId: plan.workloadId,
      operation: plan.operation,
      scope: this.scope,
      connector: plan.connector,
      routeId: plan.routeId,
      connectionId: plan.connectionId,
      deploymentId: plan.deploymentId,
      turnId: this.scope.turnId,
      modelVendor: plan.modelVendor,
      requestedModel: plan.requestedModel,
      ...metadata,
      startedAt: new Date(started).toISOString(),
      completedAt: new Date(completed).toISOString(),
      latencyMs: Math.max(0, completed - started),
      status: invocationStatus(failure),
      ...(failure ? { errorCode: failure.code } : {}),
      targetPosition: plan.targetPosition,
      policy: plan.policy,
      policyHash: plan.policyHash,
    });
  }

  private async invoke<T>(
    plan: AIExecutionPlan,
    externalSignal: AbortSignal | undefined,
    execute: (_connector: AIConnector, _targetPlan: AIExecutionPlan, _signal: AbortSignal) => Promise<T>,
    metadataFor: (_result: T) => InvocationMetadata,
    allowedOperations: AIOperation[],
  ): Promise<T> {
    const targets = this.targets(plan);
    let lastFailure: AIExecutionError | null = null;
    for (let index = 0; index < targets.length; index += 1) {
      const targetPlan = selectAIExecutionTarget(plan, targets[index]);
      const started = this.now();
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort(externalSignal?.reason);
      if (externalSignal?.aborted) abort();
      else externalSignal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, targetPlan.timeoutMs);
      let metadata: InvocationMetadata = {};
      let failure: AIExecutionError | null = null;
      try {
        const connector = await this.requireOperation(targetPlan, allowedOperations);
        const result = await execute(connector, targetPlan, controller.signal);
        metadata = metadataFor(result);
        this.pinnedTargets.set(plan, targetPlan.targetPosition);
        return result;
      } catch (error) {
        failure = normalizeError(error, timedOut);
        lastFailure = failure;
        if (!this.canFallback(plan, failure, targetPlan.targetPosition)) throw failure;
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abort);
        await this.recordAttempt(targetPlan, started, metadata, failure);
      }
    }
    throw lastFailure ?? new AIExecutionError('policy_unsatisfied', 'AI route has no targets');
  }

  generateText(plan: AIExecutionPlan, request: AIGenerationRequest): Promise<AITextResult> {
    return this.invoke(
      plan,
      request.signal,
      (connector, targetPlan, signal) => {
        if (!connector.generateText) throw new AIExecutionError('capability_mismatch', 'Connector cannot generate text');
        return connector.generateText(targetPlan, { ...request, signal });
      },
      result => responseMetadata(result.response),
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
      (connector, targetPlan, signal) => {
        if (!connector.generateStructured) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot generate structured output');
        }
        return connector.generateStructured(targetPlan, { ...request, signal }, parse);
      },
      result => responseMetadata(result.response),
      ['structured_generation'],
    );
  }

  runToolConversation(plan: AIExecutionPlan, request: AIToolConversationRequest): Promise<AIResponse> {
    return this.invoke(
      plan,
      request.signal,
      (connector, targetPlan, signal) => {
        if (!connector.runToolConversation) {
          throw new AIExecutionError('capability_mismatch', 'Connector cannot run tool conversations');
        }
        return connector.runToolConversation(targetPlan, { ...request, signal });
      },
      responseMetadata,
      ['tool_conversation'],
    );
  }

  streamText(plan: AIExecutionPlan, request: AIGenerationRequest): AsyncIterable<AIStreamChunk> {
    return this.stream(plan, request, ['text_generation'], (connector, targetPlan, signal) => {
      if (!connector.streamText) throw new AIExecutionError('capability_mismatch', 'Connector cannot stream text');
      return connector.streamText(targetPlan, { ...request, signal });
    });
  }

  streamToolConversation(
    plan: AIExecutionPlan,
    request: AIToolConversationRequest,
  ): AsyncIterable<AIStreamChunk> {
    return this.stream(plan, request, ['tool_conversation'], (connector, targetPlan, signal) => {
      if (!connector.streamToolConversation) {
        throw new AIExecutionError('capability_mismatch', 'Connector cannot stream tool conversations');
      }
      return connector.streamToolConversation(targetPlan, { ...request, signal });
    });
  }

  private async *stream(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    allowedOperations: AIOperation[],
    createStream: (
      _connector: AIConnector,
      _targetPlan: AIExecutionPlan,
      _signal: AbortSignal,
    ) => AsyncIterable<AIStreamChunk>,
  ): AsyncIterable<AIStreamChunk> {
    const targets = this.targets(plan);
    let lastFailure: AIExecutionError | null = null;
    for (const target of targets) {
      const targetPlan = selectAIExecutionTarget(plan, target);
      const started = this.now();
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort(request.signal?.reason);
      if (request.signal?.aborted) abort();
      else request.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, targetPlan.timeoutMs);
      let metadata: InvocationMetadata = {};
      let failure: AIExecutionError | null = null;
      let accepted = false;
      let completed = false;
      try {
        const connector = await this.requireOperation(targetPlan, allowedOperations);
        for await (const chunk of createStream(connector, targetPlan, controller.signal)) {
          if (!accepted) {
            accepted = true;
            this.pinnedTargets.set(plan, targetPlan.targetPosition);
          }
          if (chunk.type === 'message_start') {
            metadata = {
              ...metadata,
              resolvedModel: chunk.model,
              resolvedProvider: chunk.resolvedProvider,
              providerRequestId: chunk.providerRequestId,
              usage: chunk.usage,
            };
          } else if (chunk.type === 'message_stop') {
            metadata = {
              ...metadata,
              resolvedModel: chunk.model ?? metadata.resolvedModel,
              resolvedProvider: chunk.resolvedProvider ?? metadata.resolvedProvider,
              providerRequestId: chunk.providerRequestId ?? metadata.providerRequestId,
              usage: {
                inputTokens: Math.max(
                  chunk.usage?.inputTokens ?? 0,
                  metadata.usage?.inputTokens ?? 0,
                ),
                outputTokens: Math.max(
                  chunk.usage?.outputTokens ?? 0,
                  metadata.usage?.outputTokens ?? 0,
                ),
                cachedInputTokens: chunk.usage?.cachedInputTokens ?? metadata.usage?.cachedInputTokens,
                reasoningTokens: chunk.usage?.reasoningTokens ?? metadata.usage?.reasoningTokens,
              },
            };
          }
          yield chunk;
        }
        completed = true;
      } catch (error) {
        failure = normalizeError(error, timedOut);
        lastFailure = failure;
      } finally {
        if (!completed && !failure) {
          failure = new AIExecutionError('aborted', 'AI stream was closed before completion');
        }
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        await this.recordAttempt(targetPlan, started, metadata, failure);
      }
      if (completed) return;
      if (accepted || !failure || !this.canFallback(plan, failure, targetPlan.targetPosition)) {
        throw failure ?? lastFailure ?? new AIExecutionError('provider_error', 'AI stream failed');
      }
    }
    throw lastFailure ?? new AIExecutionError('policy_unsatisfied', 'AI route has no targets');
  }

  transcribe(plan: AIExecutionPlan, request: AITranscriptionRequest): Promise<AITranscriptionResult> {
    return this.invoke(
      plan,
      request.signal,
      (connector, targetPlan, signal) => {
        if (!connector.transcribe) throw new AIExecutionError('capability_mismatch', 'Connector cannot transcribe audio');
        return connector.transcribe(targetPlan, { ...request, signal });
      },
      result => ({
        resolvedModel: result.model,
        providerRequestId: result.providerRequestId,
        usage: result.usage,
      }),
      ['transcription'],
    );
  }
}
