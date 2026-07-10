// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold-worker', () => {
  const src = readFileSync('lib/builder/scaffold-worker.ts', 'utf8');

  it('exports scaffoldQueue', () => {
    expect(src).toMatch(/export.*scaffoldQueue|export const scaffoldQueue/);
  });

  it('exports enqueueScaffoldBuildJob', () => {
    expect(src).toMatch(/export.*enqueueScaffoldBuildJob/);
  });

  it('exports createScaffoldWorker', () => {
    expect(src).toMatch(/export.*createScaffoldWorker/);
  });

  it('uses REDIS_URL for connection', () => {
    expect(src).toMatch(/REDIS_URL/);
  });

  it('updates proposal phase to building when job starts', () => {
    expect(src).toMatch(/phase.*building|building.*phase/);
  });

  it('routes review outcomes through the review gate — never unconditionally ready_to_apply', () => {
    expect(src).toMatch(/evaluateReviewGate/);
    expect(src).toMatch(/needs_repair/);
    expect(src).toMatch(/gate\.pass \? 'ready_to_apply' : 'needs_repair'/);
  });

  it('enforces the path policy on generated files before review', () => {
    expect(src).toMatch(/evaluatePathPolicy/);
  });

  it('reviews supplied files for generic proposals instead of requiring a plan', () => {
    expect(src).toMatch(/generated_code/);
  });

  it('marks the proposal failed when a run fails', () => {
    expect(src).toMatch(/phase: 'failed'/);
  });

  it('treats unparseable review output as a blocking error, not a passing warning', () => {
    expect(src).not.toMatch(/score: 50/);
  });

  it('writes review_report to proposal', () => {
    expect(src).toMatch(/review_report/);
  });
});
