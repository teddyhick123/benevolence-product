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
  | 'transcription';

export type AIConnectorId = 'anthropic' | 'transcription_platform';

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
  },
  extraction: {
    id: 'extraction',
    displayName: 'Document extraction',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
  },
  import: {
    id: 'import',
    displayName: 'Import copilot',
    operation: 'structured_generation',
    requiredCapabilities: ['text', 'json'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
  },
  import_chat: {
    id: 'import_chat',
    displayName: 'Import copilot chat',
    operation: 'text_generation',
    requiredCapabilities: ['text', 'streaming'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 4096, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
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
  },
  letters: {
    id: 'letters',
    displayName: 'Portfolio letters',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 2000, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
  },
  summaries: {
    id: 'summaries',
    displayName: 'Portfolio summaries',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 256, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
  },
  financial_profile: {
    id: 'financial_profile',
    displayName: 'Financial profiles',
    operation: 'text_generation',
    requiredCapabilities: ['text'],
    inputDataClass: 'sensitive',
    defaultLimits: { maxOutputTokens: 1500, timeoutMs: 60_000 },
    platformDefault: { connector: 'anthropic', model: AI_MODELS.assistant },
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
  },
} as const;

export function getAIWorkload(id: AIWorkloadId): AIWorkloadDefinition {
  return AI_WORKLOADS[id];
}
