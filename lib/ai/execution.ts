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

export type AIExecutionTarget = Readonly<{
  position: number;
  kind: 'deployment' | 'platform_default';
  connector: AIConnectorId;
  requestedModel: string;
  modelVendor?: string;
  connectionId?: string;
  deploymentId?: string;
  providerPreferences?: Readonly<Record<string, unknown>>;
  toolMode: 'full' | 'read_only';
}>;

export type AIExecutionPlan = Readonly<{
  workloadId: AIWorkloadId;
  operation: AIOperation;
  connector: AIConnectorId;
  requestedModel: string;
  requiredCapabilities: readonly AICapability[];
  maxOutputTokens: number;
  timeoutMs: number;
  source: 'platform_default' | 'organization_route';
  routeId?: string;
  connectionId?: string;
  deploymentId?: string;
  modelVendor?: string;
  targetPosition: number;
  targets: readonly AIExecutionTarget[];
  policy: Readonly<Record<string, unknown>>;
  policyHash: string;
  providerPreferences?: Readonly<Record<string, unknown>>;
  toolMode: 'full' | 'read_only';
}>;

export type AIGenerationRequest = {
  system?: string;
  messages: AIMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  responseFormat?: {
    name: string;
    schema: Record<string, unknown>;
  };
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
  routeId?: string;
  connectionId?: string;
  deploymentId?: string;
  turnId?: string;
  modelVendor?: string;
  requestedModel: string;
  resolvedModel?: string;
  resolvedProvider?: string;
  providerRequestId?: string;
  usage?: AIUsage;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: AIInvocationStatus;
  errorCode?: AIErrorCode;
  targetPosition: number;
  policy: Readonly<Record<string, unknown>>;
  policyHash: string;
  reportedCost?: number;
  costCurrency?: string;
};

export type AIErrorCode =
  | 'credential_invalid'
  | 'credit_exhausted'
  | 'rate_limited'
  | 'deployment_unavailable'
  | 'capability_mismatch'
  | 'policy_unsatisfied'
  | 'credential_decryption_failed'
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
