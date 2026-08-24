import type { EvalCase } from '@/lib/ai/evals/types';
import { containsAll, omitsPlaceholders, withinTokens } from '@/lib/ai/evals/assertions';

const PROMPT = [
  'Write a short acknowledgment letter using exactly these facts and no others.',
  'Donor: Acme Trust',
  'Amount: $5,000',
  'Date: 2026-03-14',
].join('\n');

export const lettersCases: readonly EvalCase[] = [
  {
    id: 'includes-merge-facts',
    required: true,
    prompt: PROMPT,
    assertions: [containsAll(['Acme Trust', '$5,000', '2026-03-14'])],
  },
  {
    id: 'no-placeholder-text',
    required: true,
    prompt: PROMPT,
    assertions: [omitsPlaceholders()],
  },
  {
    id: 'within-budget',
    required: true,
    prompt: PROMPT,
    assertions: [withinTokens(600)],
  },
  {
    id: 'has-salutation-and-closing',
    required: false,
    prompt: PROMPT,
    assertions: [containsAll(['Dear'])],
  },
];
