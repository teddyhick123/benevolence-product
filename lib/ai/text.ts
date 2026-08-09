import type { AIResponse } from '@/lib/ai/types';

export function extractText(response: AIResponse): string {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
