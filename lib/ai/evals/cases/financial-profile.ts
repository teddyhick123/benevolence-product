import type { EvalCase } from '@/lib/ai/evals/types';
import { respondsWithText, withinTokens } from '@/lib/ai/evals/assertions';

export const financialProfileCases: readonly EvalCase[] = [
  {
    id: 'within-budget',
    required: true,
    system: 'Describe the financial profile. Use only figures given to you.',
    prompt: 'Total assets $4,000,000. Annual giving $200,000. Payout rate 5%.',
    assertions: [withinTokens(900), respondsWithText()],
  },
];
