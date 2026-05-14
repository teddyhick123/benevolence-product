// lib/import/ai/client.ts
// Provider-neutral client wrapper for import AI services.

import { AI_MODELS } from '@/lib/ai/models';
import { createAIProvider } from '@/lib/ai/factory';
import { extractText } from '@/lib/ai/text';

export interface AICallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  options?: AICallOptions
): Promise<string> {
  const provider = createAIProvider();
  const response = await provider.createMessage({
    model: options?.model ?? AI_MODELS.assistant,
    maxTokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = extractText(response);
  if (!content) throw new Error('Unexpected empty response from AI provider');
  return content;
}

export async function callAIStreaming(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  options?: AICallOptions
): Promise<void> {
  const provider = createAIProvider();
  const stream = provider.createStream({
    model: options?.model ?? AI_MODELS.assistant,
    maxTokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text_delta') {
      onChunk(chunk.text);
    }
  }
}
