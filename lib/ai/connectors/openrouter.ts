import type { AIConnectorId } from '@/lib/ai/workloads';
import {
  OpenAICompatibleConnector,
  type OpenAICompatibleConfig,
} from '@/lib/ai/connectors/openai-compatible';
import {
  openRouterCredentialSchema,
  openRouterProviderPreferencesSchema,
} from '@/lib/schemas/ai-settings';
import type { z } from 'zod';

const OPENROUTER_API_ORIGIN = 'https://openrouter.ai/api/v1';

type ProviderPreferences = z.infer<typeof openRouterProviderPreferencesSchema>;

export type OpenRouterConnectorOptions = {
  apiKey: string;
  provider?: ProviderPreferences;
  fetch?: typeof fetch;
};

export class OpenRouterConnector extends OpenAICompatibleConnector {
  readonly id = 'openrouter' as const satisfies AIConnectorId;

  constructor(options: OpenRouterConnectorOptions) {
    const provider = options.provider
      ? openRouterProviderPreferencesSchema.parse(options.provider)
      : undefined;
    super({
      id: 'openrouter',
      origin: OPENROUTER_API_ORIGIN,
      apiKey: openRouterCredentialSchema.parse({ apiKey: options.apiKey }).apiKey,
      fetch: options.fetch,
      // allow_fallbacks stays false: a silent reroute to another upstream is a
      // different model than the one the deployment names.
      bodyExtras: { provider: { ...(provider ?? {}), allow_fallbacks: false } },
    } satisfies OpenAICompatibleConfig);
  }
}
