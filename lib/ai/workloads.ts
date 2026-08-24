import { AI_MODELS } from '@/lib/ai/models';

export type AIOperation =
  | 'text_generation'
  | 'structured_generation'
  | 'tool_conversation'
  | 'transcription';

export type AICapability =
  | 'text'
  | 'json'
  | 'tools'
  | 'streaming'
  | 'parallel_tool_results'
  | 'audio_input';

export type AIWorkloadId =
  | 'assistant'
  | 'extraction'
  | 'import'
  | 'import_chat'
  | 'onboarding'
  | 'letters'
  | 'summaries'
  | 'financial_profile'
  | 'transcription'
  | 'builder_chat'
  | 'builder_plan'
  | 'builder_build'
  | 'builder_review';

export type AIConnectorId = 'anthropic' | 'openai' | 'openrouter' | 'transcription_platform';

export interface AIWorkloadDefinition {
  id: AIWorkloadId;
  displayName: string;
  operation: AIOperation;
  requiredCapabilities: readonly AICapability[];
  inputDataClass: 'internal' | 'sensitive';
  defaultLimits: {
    maxOutputTokens: number;
    timeoutMs: number;
  };
  platformDefault: {
    connector: AIConnectorId;
    model: string;
  };
  toolRisk?: 'none' | 'read_only' | 'mutation';
  /**
   * Whether an organization may route this workload to its own deployment.
   * False for platform tooling: routing it would move the platform's own
   * spend onto a client's credential.
   */
  orgRoutable: boolean;
}

export const AI_WORKLOADS: Readonly<Record<AIWorkloadId, AIWorkloadDefinition>> = {
  assistant: {
    id: 'assistant',
    displayName: 'Portfolio assistant',
    operation: 'tool_conversation',
    requiredCapabilities: ['text', 'tools', 'streaming', 'parallel_tool_results'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    toolRisk: 'mutation',
    orgRoutable: true,
  },
  extraction: {
    id: 'extraction',
    displayName: 'Document extraction',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  import: {
    id: 'import',
    displayName: 'Import copilot',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  import_chat: {
    id: 'import_chat',
    displayName: 'Import copilot chat',
    operation: 'text_generation',
    requiredCapabilities: ['text', 'streaming'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  onboarding: {
    id: 'onboarding',
    displayName: 'Onboarding assistant',
    operation: 'tool_conversation',
    requiredCapabilities: ['text', 'tools'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 2048, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    toolRisk: 'none',
    orgRoutable: true,
  },
  letters: {
    id: 'letters',
    displayName: 'Portfolio letters',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 2000, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  summaries: {
    id: 'summaries',
    displayName: 'Portfolio summaries',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 256, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  financial_profile: {
    id: 'financial_profile',
    displayName: 'Financial profiles',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 1500, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
    orgRoutable: true,
  },
  transcription: {
    id: 'transcription',
    displayName: 'Audio transcription',
    operation: 'transcription',
    requiredCapabilities: ['audio_input'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 0, timeoutMs: 30_000 },
    platformDefault: {
      connector: 'transcription_platform',
      model: process.env.TRANSCRIPTION_MODEL ?? 'whisper-1',
    },
    orgRoutable: true,
  },
  builder_chat: {
    id: 'builder_chat',
    displayName: 'Builder chat',
    operation: 'tool_conversation',
    requiredCapabilities: ['text', 'tools', 'streaming'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 120_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_CHAT ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.assistant,
    },
    toolRisk: 'mutation',
    orgRoutable: false,
  },
  builder_plan: {
    id: 'builder_plan',
    displayName: 'Builder scaffold planning',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 8192, timeoutMs: 180_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_PLAN ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldPlan,
    },
    orgRoutable: false,
  },
  builder_build: {
    id: 'builder_build',
    displayName: 'Builder scaffold generation',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 16384, timeoutMs: 300_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_BUILD ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldBuild,
    },
    orgRoutable: false,
  },
  builder_review: {
    id: 'builder_review',
    displayName: 'Builder model review',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'internal',
    defaultLimits: { maxOutputTokens: 8192, timeoutMs: 300_000 },
    platformDefault: {
      connector: (process.env.AI_CONNECTOR_BUILDER_REVIEW ?? 'anthropic') as AIConnectorId,
      model: AI_MODELS.scaffoldReview,
    },
    orgRoutable: false,
  },
} as const;

export function getAIWorkload(id: AIWorkloadId): AIWorkloadDefinition {
  return AI_WORKLOADS[id];
}

export function orgRoutableWorkloads(): AIWorkloadDefinition[] {
  return Object.values(AI_WORKLOADS).filter(workload => workload.orgRoutable);
}
