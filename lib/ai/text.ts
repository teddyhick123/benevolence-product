import { createAIProvider } from '@/lib/ai/factory';
import type { AIMessage, AIResponse } from '@/lib/ai/types';

export function extractText(response: AIResponse): string {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export async function generateText(params: {
  system?: string;
  prompt?: string;
  messages?: AIMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const provider = createAIProvider();
  const messages = params.messages ?? [{ role: 'user' as const, content: params.prompt ?? '' }];
  const response = await provider.createMessage({
    model: params.model,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    system: params.system,
    messages,
  });
  return extractText(response);
}
