import type { AIConnector } from '@/lib/ai/execution';
import type { AIConnectorId } from '@/lib/ai/workloads';
import { AnthropicConnector } from '@/lib/ai/connectors/anthropic';
import { PlatformTranscriptionConnector } from '@/lib/ai/connectors/transcription-platform';

export type AIConnectorFactory = () => AIConnector;

const CONNECTORS: Readonly<Record<AIConnectorId, AIConnectorFactory>> = {
  anthropic: () => new AnthropicConnector(),
  transcription_platform: () => new PlatformTranscriptionConnector(),
};

export function createAIConnector(id: AIConnectorId): AIConnector {
  return CONNECTORS[id]();
}
