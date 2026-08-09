import OpenAI from 'openai';
import type {
  AIConnector,
  AIExecutionPlan,
  AITranscriptionRequest,
} from '@/lib/ai/execution';

export class PlatformTranscriptionConnector implements AIConnector {
  readonly id = 'transcription_platform' as const;
  readonly capabilities = ['audio_input'] as const;

  async transcribe(plan: AIExecutionPlan, request: AITranscriptionRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Transcription provider is not configured');
    const response = await new OpenAI({ apiKey }).audio.transcriptions.create(
      {
        file: request.file,
        model: plan.requestedModel,
        language: request.language ?? 'en',
        response_format: 'json',
      },
      { signal: request.signal },
    );
    return { text: response.text, model: plan.requestedModel };
  }
}
