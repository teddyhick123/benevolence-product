// lib/ai/factory.ts
import { AnthropicProvider } from './providers/anthropic';
import type { AIProvider } from './provider';

export function createAIProvider(provider?: string): AIProvider {
  const p = provider ?? process.env.AI_PROVIDER ?? 'anthropic';
  switch (p) {
    case 'anthropic':
      return new AnthropicProvider();
    default:
      throw new Error(`Unknown AI provider: ${p}. Supported: anthropic`);
  }
}
