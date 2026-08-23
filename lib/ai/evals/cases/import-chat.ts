import type { EvalCase } from '@/lib/ai/evals/types';
import { respondsWithText, streamsProgressively, withinTokens } from '@/lib/ai/evals/assertions';

export const importChatCases: readonly EvalCase[] = [
  {
    id: 'streams-incrementally',
    required: true,
    prompt: 'Explain in two sentences what a mapping profile does.',
    assertions: [streamsProgressively(), respondsWithText()],
  },
  {
    id: 'respects-token-cap',
    required: true,
    prompt: 'Explain in two sentences what a mapping profile does.',
    assertions: [withinTokens(400)],
  },
];
