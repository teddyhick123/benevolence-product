// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const EVALUATE = readFileSync(
  join(ROOT, 'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts'),
  'utf8',
);
const STATUS = readFileSync(
  join(ROOT, 'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/runs/[runId]/route.ts'),
  'utf8',
);
const RATE_LIMIT = readFileSync(join(ROOT, 'lib/api/rate-limit.ts'), 'utf8');

describe('evaluate route', () => {
  it('enqueues instead of calling a model inline', () => {
    expect(EVALUATE).toMatch(/enqueueEvaluationRun/);
    expect(EVALUATE).not.toMatch(/BENE_OK/);
    expect(EVALUATE).not.toMatch(/generateText/);
  });

  it('returns 202 with a run id', () => {
    expect(EVALUATE).toMatch(/status:\s*202/);
    expect(EVALUATE).toMatch(/runId/);
  });

  it('guards org admin access', () => {
    expect(EVALUATE).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
    expect(STATUS).toMatch(/requireOrgAccess\(orgId, 'admin'\)/);
  });

  it('uses the table-backed run count, not the Upstash limiter', () => {
    expect(EVALUATE).toMatch(/countableRunsInLastDay/);
    expect(EVALUATE).not.toMatch(/aiDeploymentEvaluationLimiter/);
    expect(RATE_LIMIT).not.toMatch(/aiDeploymentEvaluationLimiter/);
  });

  it('records the current suite version on the run', () => {
    expect(EVALUATE).toMatch(/SUITE_VERSION/);
    expect(EVALUATE).toMatch(/caseSetHash\(\)/);
  });

  it('confirms the run belongs to the deployment in the path', () => {
    expect(STATUS).toMatch(/deployment_id !== deploymentId/);
  });
});
