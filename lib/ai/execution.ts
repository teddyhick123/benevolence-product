import type { AIMessage, AIResponse, AIStreamChunk, ToolDefinition } from '@/lib/ai/types';
import type {
  AICapability,
  AIConnectorId,
  AIOperation,
  AIWorkloadId,
} from '@/lib/ai/workloads';

export type AIExecutionScope = {
  kind: 'organization' | 'platform';
  orgId?: string;
  actorId?: string;
  portfolioId?: string;
  sessionId?: string;
  turnId?: string;
};

export type AIExecutionPlan = Readonly<{
  workloadId: AIWorkloadId;
  operation: AIOperation;
  connector: AIConnectorId;
  requestedModel: string;
  requiredCapabilities: readonly AICapability[];
  maxOutputTokens: number;
  timeoutMs: number;
  source: 'platform_default';
  policy: Readonly<Record<string, never>>;
}>;

export type AIGenerationRequest = {
  system?: string;
  messages: AIMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type AIToolConversationRequest = AIGenerationRequest & {
  tools: ToolDefinition[];
};

export type AITranscriptionRequest = {
  file: File;
  language?: string;
  signal?: AbortSignal;
};

export type AITextResult = {
  text: string;
  response: AIResponse;
};

export type AIStructuredResult<T> = AITextResult & { value: T };

export type AITranscriptionResult = {
  text: string;
  model: string;
  providerRequestId?: string;
  usage?: AIUsage;
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
};

export type AIInvocationStatus = 'succeeded' | 'failed' | 'aborted' | 'timed_out';

export type AIInvocationRecord = {
  id: string;
  workloadId: AIWorkloadId;
  operation: AIOperation;
  scope: AIExecutionScope;
  connector: AIConnectorId;
  requestedModel: string;
  resolvedModel?: string;
  providerRequestId?: string;
  usage?: AIUsage;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: AIInvocationStatus;
  errorCode?: AIErrorCode;
};

export type AIErrorCode =
  | 'credential_invalid'
  | 'credit_exhausted'
  | 'rate_limited'
  | 'deployment_unavailable'
  | 'capability_mismatch'
  | 'policy_unsatisfied'
  | 'timeout'
  | 'aborted'
  | 'provider_error';

export class AIExecutionError extends Error {
  readonly code: AIErrorCode;

  constructor(
    code: AIErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'AIExecutionError';
  }
}

export interface AIConnector {
  readonly id: AIConnectorId;
  readonly capabilities: readonly AICapability[];
  generateText?(_plan: AIExecutionPlan, _request: AIGenerationRequest): Promise<AITextResult>;
  streamText?(
    _plan: AIExecutionPlan,
    _request: AIGenerationRequest,
  ): AsyncIterable<AIStreamChunk>;
  generateStructured?<T>(
    _plan: AIExecutionPlan,
    _request: AIGenerationRequest,
    _parse: (_text: string) => T,
  ): Promise<AIStructuredResult<T>>;
  runToolConversation?(
    _plan: AIExecutionPlan,
    _request: AIToolConversationRequest,
  ): Promise<AIResponse>;
  streamToolConversation?(
    _plan: AIExecutionPlan,
    _request: AIToolConversationRequest,
  ): AsyncIterable<AIStreamChunk>;
  transcribe?(
    _plan: AIExecutionPlan,
    _request: AITranscriptionRequest,
  ): Promise<AITranscriptionResult>;
}

export type AIInvocationRecorder = (_record: AIInvocationRecord) => Promise<void>;
