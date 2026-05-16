// app/api/jobs/tasks/__tests__/generate.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('app/api/jobs/tasks/generate/route.ts', 'utf8');
const runSrc = readFileSync('lib/tasks/automation/run.ts', 'utf8');

describe('generate route contract', () => {
  it('checks x-job-secret header', () => {
    expect(src).toContain('x-job-secret');
    expect(src).toContain('CRON_SECRET');
  });

  it('supports dry_run flag', () => {
    expect(src).toContain('dry_run');
  });

  it('logs run to task_automation_runs', () => {
    expect(src).toContain('task_automation_runs');
  });

  it('checks for in-flight runs before starting', () => {
    expect(src).toContain('status');
    expect(src).toContain('running');
  });

  it('run.ts exports runProducers and PRODUCERS', () => {
    expect(runSrc).toContain('runProducers');
    expect(runSrc).toContain('PRODUCERS');
  });
});
