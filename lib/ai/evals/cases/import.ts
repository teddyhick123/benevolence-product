import type { EvalCase } from '@/lib/ai/evals/types';
import { jsonMatchesSchema } from '@/lib/ai/evals/assertions';

const SCHEMA = {
  type: 'object',
  required: ['mappings'],
  properties: { mappings: { type: 'array' } },
};

export const importCases: readonly EvalCase[] = [
  {
    id: 'schema-valid-mapping',
    required: true,
    system: 'Map source columns onto platform fields. Return JSON only.',
    prompt: 'Source columns: donor_name, gift_amount, gift_date. Return {"mappings":[{"source":...,"target":...}]}.',
    responseSchema: SCHEMA,
    assertions: [jsonMatchesSchema(SCHEMA)],
  },
];
