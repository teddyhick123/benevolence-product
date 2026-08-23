import type { EvalCase } from '@/lib/ai/evals/types';
import { groundedIn, jsonMatchesSchema } from '@/lib/ai/evals/assertions';

const SOURCE = [
  'GRANT AGREEMENT',
  'Recipient: Riverside Community Trust',
  'Employer Identification Number: 12-3456789',
  'Award amount: $25,000',
  'Agreement date: 2026-03-14',
].join('\n');

const SCHEMA = {
  type: 'object',
  required: ['recipient_name', 'ein', 'amount_usd'],
  properties: {
    recipient_name: { type: 'string' },
    ein: { type: 'string' },
    amount_usd: { type: 'number' },
  },
};

export const extractionCases: readonly EvalCase[] = [
  {
    id: 'schema-valid-output',
    required: true,
    system: 'Extract the requested fields from the document. Return JSON only.',
    prompt: `Extract recipient_name, ein and amount_usd from this document:\n\n${SOURCE}`,
    sourceText: SOURCE,
    responseSchema: SCHEMA,
    assertions: [jsonMatchesSchema(SCHEMA)],
  },
  {
    id: 'no-invented-values',
    required: true,
    system: 'Extract the requested fields from the document. Return JSON only. Never invent a value.',
    prompt: `Extract recipient_name, ein and amount_usd from this document:\n\n${SOURCE}`,
    sourceText: SOURCE,
    responseSchema: SCHEMA,
    assertions: [groundedIn()],
  },
];
