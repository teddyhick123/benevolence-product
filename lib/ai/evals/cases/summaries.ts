import type { EvalCase } from '@/lib/ai/evals/types';
import { respondsWithText, withinTokens } from '@/lib/ai/evals/assertions';

export const summariesCases: readonly EvalCase[] = [
  {
    id: 'within-budget',
    required: true,
    system: 'Summarise in at most two sentences. Use only figures given to you.',
    prompt: 'Portfolio: 12 holdings, $1,250,000 total, 3 grants closing this quarter.',
    assertions: [withinTokens(120), respondsWithText()],
  },
];
