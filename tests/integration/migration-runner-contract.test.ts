// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUNNER = readFileSync(
  join(__dirname, '..', '..', 'scripts/migrate-client.ts'),
  'utf8',
);

describe('migration runner', () => {
  // execSql throws on error and discards the body, so reading needs its own
  // path rather than a caller trying to interpret a void return.
  it('has a query path that returns rows', () => {
    expect(RUNNER).toMatch(/async function querySql/);
    expect(RUNNER).toMatch(/Promise<T\[\]>/);
  });

  it('discovers migrations with a version string, not only a number', () => {
    expect(RUNNER).toMatch(/version:\s*f\.slice\(0,\s*4\)/);
  });

  // The ref is derived from SUPABASE_URL exactly as execSql does; adding a new
  // required environment variable would break every existing deployment.
  it('derives the project ref rather than requiring a new env var', () => {
    expect(RUNNER).not.toMatch(/SUPABASE_PROJECT_REF/);
  });
});
