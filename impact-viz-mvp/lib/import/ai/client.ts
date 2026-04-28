// lib/import/ai/client.ts
// Anthropic client wrapper for the import AI services

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  const message = await anthropic.messages.create({
    model: options?.model ?? 'claude-haiku-4-5',
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from AI');
  return content.text;
}

export async function callAIStreaming(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  options?: AICallOptions
): Promise<void> {
  const stream = anthropic.messages.stream({
    model: options?.model ?? 'claude-haiku-4-5',
    max_tokens: options?.maxTokens ?? 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
}
