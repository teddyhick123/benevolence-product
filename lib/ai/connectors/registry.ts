import type { AIConnector } from '@/lib/ai/execution';
import type { AIConnectorId } from '@/lib/ai/workloads';
import { AnthropicConnector } from '@/lib/ai/connectors/anthropic';
import { PlatformTranscriptionConnector } from '@/lib/ai/connectors/transcription-platform';
import {
  OpenRouterConnector,
  type OpenRouterConnectorOptions,
} from '@/lib/ai/connectors/openrouter';

export type AIConnectorFactoryContext = {
  openrouter?: OpenRouterConnectorOptions;
};

export type AIConnectorFactory = (_context?: AIConnectorFactoryContext) => AIConnector;

const CONNECTORS: Readonly<Record<AIConnectorId, AIConnectorFactory>> = {
  anthropic: () => new AnthropicConnector(),
  openrouter: (context) => {
    if (!context?.openrouter) {
      throw new Error('OpenRouter connectors require an organization credential');
    }
    return new OpenRouterConnector(context.openrouter);
  },
  transcription_platform: () => new PlatformTranscriptionConnector(),
};

export function createAIConnector(
  id: AIConnectorId,
  context?: AIConnectorFactoryContext,
): AIConnector {
  return CONNECTORS[id](context);
}
