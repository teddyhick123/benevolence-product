import type { EvalCase } from '@/lib/ai/evals/types';
import { respondsWithText } from '@/lib/ai/evals/assertions';

/**
 * Unreachable for organization deployments: no catalog template advertises
 * audio_input. Present so the coverage guard holds uniformly.
 */
export const transcriptionCases: readonly EvalCase[] = [
  {
    id: 'returns-text',
    required: true,
    prompt: '',
    assertions: [respondsWithText()],
  },
];
