// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ROUTE = join(
  ROOT,
  'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts',
);
const WORKER = join(ROOT, 'lib/ai/evals/queue.ts');

describe('deployment evaluation connector coverage', () => {
  const route = readFileSync(ROUTE, 'utf8');
  const worker = readFileSync(WORKER, 'utf8');

  it('does not gate evaluation on the OpenRouter connector', () => {
    expect(route).not.toMatch(/connection\.connector !== 'openrouter'/);
    expect(worker).not.toMatch(/connection\.connector !== 'openrouter'/);
  });

  // Phase 2B moved model execution out of the route and into the worker, so
  // the connector is now built there — still through the registry, never a
  // direct constructor.
  it('builds its connector through the registry, not a direct constructor', () => {
    expect(worker).not.toMatch(/new OpenRouterConnector\(/);
    expect(worker).toMatch(/createAIConnector\(/);
  });

  it('supports every organization connector when building the connector', () => {
    expect(worker).toMatch(/anthropic: \{ apiKey/);
    expect(worker).toMatch(/openai: \{ apiKey/);
    expect(worker).toMatch(/openrouter: \{/);
  });
});
