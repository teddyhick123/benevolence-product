import type { AIConnectorId } from '@/lib/ai/workloads';
import {
  OpenAICompatibleConnector,
  type OpenAICompatibleConfig,
} from '@/lib/ai/connectors/openai-compatible';
import { directProviderCredentialSchema } from '@/lib/schemas/ai-settings';

const OPENAI_API_ORIGIN = 'https://api.openai.com/v1';

export type OpenAIConnectorOptions = {
  apiKey: string;
  fetch?: typeof fetch;
};

/**
 * Direct OpenAI. Same wire format as OpenRouter minus the routing preferences,
 * which are an OpenRouter marketplace concept with no meaning against a
 * first-party endpoint.
 */
export class OpenAIConnector extends OpenAICompatibleConnector {
  readonly id = 'openai' as const satisfies AIConnectorId;

  constructor(options: OpenAIConnectorOptions) {
    super({
      id: 'openai',
      origin: OPENAI_API_ORIGIN,
      apiKey: directProviderCredentialSchema.parse({ apiKey: options.apiKey }).apiKey,
      fetch: options.fetch,
    } satisfies OpenAICompatibleConfig);
  }
}
