import type { AIConnector } from '@/lib/ai/execution';
import type { AIConnectorId } from '@/lib/ai/workloads';
import { AnthropicConnector } from '@/lib/ai/connectors/anthropic';
import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
import { OpenAIConnector } from '@/lib/ai/connectors/openai';
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
  anthropic: (context) => new AnthropicConnector(
    new AnthropicProvider(context?.anthropic?.apiKey),
  ),
  openrouter: (context) => {
    if (!context?.openrouter) {
      throw new Error('OpenRouter connectors require an organization credential');
    }
    return new OpenRouterConnector(context.openrouter);
  },
  openai: (context) => {
    if (!context?.openai) {
      throw new Error('OpenAI connectors require an organization credential');
    }
    return new OpenAIConnector(context.openai);
  },
  transcription_platform: () => new PlatformTranscriptionConnector(),
};

export function createAIConnector(
  id: AIConnectorId,
  context?: AIConnectorFactoryContext,
): AIConnector {
  return CONNECTORS[id](context);
}
