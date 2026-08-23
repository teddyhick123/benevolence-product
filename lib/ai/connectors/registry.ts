import type { AIConnector } from '@/lib/ai/execution';
import type { AIConnectorId } from '@/lib/ai/workloads';
import { AnthropicConnector } from '@/lib/ai/connectors/anthropic';
import { PlatformTranscriptionConnector } from '@/lib/ai/connectors/transcription-platform';
import {
  OpenRouterConnector,
  type OpenRouterConnectorOptions,
} from '@/lib/ai/connectors/openrouter';

export type DirectProviderConnectorOptions = { apiKey: string };

export type AIConnectorFactoryContext = {
  openrouter?: OpenRouterConnectorOptions;
  anthropic?: DirectProviderConnectorOptions;
  openai?: DirectProviderConnectorOptions;
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
  // Replaced with the real OpenAIConnector in Task 5. Declared now so the
  // registry stays exhaustive over AIConnectorId rather than being widened.
  openai: () => {
    throw new Error('The OpenAI connector is not implemented yet');
  },
  transcription_platform: () => new PlatformTranscriptionConnector(),
};

export function createAIConnector(
  id: AIConnectorId,
  context?: AIConnectorFactoryContext,
): AIConnector {
  return CONNECTORS[id](context);
}
