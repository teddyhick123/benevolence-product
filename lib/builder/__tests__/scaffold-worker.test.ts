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

  it('updates proposal phase to ready_to_apply after review', () => {
    expect(src).toMatch(/ready_to_apply/);
  });

  it('writes review_report to proposal', () => {
    expect(src).toMatch(/review_report/);
  });
});
