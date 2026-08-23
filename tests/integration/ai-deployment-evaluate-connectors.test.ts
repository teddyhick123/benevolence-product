// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(
  __dirname, '..', '..',
  'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts',
);

describe('deployment evaluation connector coverage', () => {
  const source = readFileSync(ROUTE, 'utf8');

  it('does not gate evaluation on the OpenRouter connector', () => {
    expect(source).not.toMatch(/connection\.connector !== 'openrouter'/);
  });

  it('builds its connector through the registry, not a direct constructor', () => {
    expect(source).not.toMatch(/new OpenRouterConnector\(/);
    expect(source).toMatch(/createAIConnector\(/);
  });

  it('still records a conditional result until a real eval suite exists', () => {
    expect(source).toMatch(/result: 'conditional'/);
    expect(source).not.toMatch(/result: 'passed'/);
  });
});
