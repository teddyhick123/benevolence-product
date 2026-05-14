import OpenAI from 'openai';

export async function transcribeAudio(file: File): Promise<string> {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? 'openai';

  switch (provider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('Transcription provider is not configured');
      }

      const openai = new OpenAI({ apiKey });
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: process.env.TRANSCRIPTION_MODEL ?? 'whisper-1',
        language: 'en',
        response_format: 'json',
      });

      return transcription.text;
    }
    default:
      throw new Error(`Unsupported transcription provider: ${provider}`);
  }
}
