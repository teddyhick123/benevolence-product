// lib/import/ai/client.ts
// Provider-neutral client wrapper for import AI services.

import type { AIExecutionScope } from '@/lib/ai/execution';
import { createAIExecutionGateway } from '@/lib/ai/runtime';

export interface AICallOptions {
  scope: AIExecutionScope;
  maxTokens?: number;
  temperature?: number;
}

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions
): Promise<string> {
  if (!options.scope) throw new Error('AI execution scope is required');
  const gateway = createAIExecutionGateway(options.scope);
  const response = await gateway.generateText(gateway.resolve('import'), {
    maxOutputTokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.text;
  if (!content) throw new Error('Unexpected empty response from AI provider');
  return content;
}

export async function callAIStreaming(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (_text: string) => void,
  options: AICallOptions
): Promise<void> {
  if (!options.scope) throw new Error('AI execution scope is required');
  const gateway = createAIExecutionGateway(options.scope);
  const stream = gateway.streamText(gateway.resolve('import_chat'), {
    maxOutputTokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text_delta') {
      onChunk(chunk.text);
    }
  }
}
