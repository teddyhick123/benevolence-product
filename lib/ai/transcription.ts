import type { AIExecutionScope } from '@/lib/ai/execution';
import { createAIExecutionGateway } from '@/lib/ai/runtime';

export async function transcribeAudio(
  file: File,
  scope: AIExecutionScope,
): Promise<string> {
  const gateway = createAIExecutionGateway(scope);
  const result = await gateway.transcribe(gateway.resolve('transcription'), {
    file,
    language: 'en',
  });
  return result.text;
}
