import type { Observed } from '@/lib/ai/evals/types';
import { EvalTransportError } from '@/lib/ai/evals/types';
import { guardTransport, type Driver } from '@/lib/ai/evals/drivers/text-generation';

/**
 * No deployment template advertises audio_input today, so this path is
 * unreachable for organization deployments. It exists so the coverage guard
 * holds uniformly and so the workload is ready when an audio-capable template
 * appears. See the spec, "transcription is unreachable".
 */
export const transcriptionDriver: Driver = async (connector, plan): Promise<Observed> => {
  if (!connector.transcribe) throw new EvalTransportError('Connector cannot transcribe');
  const file = new File([new Uint8Array([0])], 'fixture.wav', { type: 'audio/wav' });
  const result = await guardTransport(() => connector.transcribe!(plan, { file }));
  return { text: result.text };
};
