// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('import worker privilege boundary', () => {
  it.each([
    'lib/import/job-queue.ts',
    'lib/import/stale-job-watchdog.ts',
  ])('%s does not construct an elevated client', file => {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).not.toContain('createAdminClient');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE');
  });

  it('constructs the import processor with an explicit job principal', () => {
    const source = fs.readFileSync('lib/import/job-queue.ts', 'utf8');
    expect(source).toContain('createImportWorkerRepository');
    expect(source).toContain("principal: { kind: 'job', job: 'import' }");
  });

  it('constructs the watchdog with an explicit job principal', () => {
    const source = fs.readFileSync('lib/import/stale-job-watchdog.ts', 'utf8');
    expect(source).toContain('createImportWatchdogRepository');
    expect(source).toContain("job: 'import-watchdog'");
  });
});
