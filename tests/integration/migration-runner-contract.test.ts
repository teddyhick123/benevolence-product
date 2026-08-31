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

describe('ledger-aware behaviour', () => {
  it('compares against the ledger rather than a hand-supplied range', () => {
    expect(RUNNER).toMatch(/compareLedger/);
    expect(RUNNER).toMatch(/applied_migrations/);
  });

  // The roadmap's exit criterion: a no-op that says so, rather than silently
  // re-running everything.
  it('reports when nothing is pending', () => {
    expect(RUNNER).toMatch(/already up to date|nothing to apply|No pending migrations/i);
  });

  it('refuses on drift and names both checksums', () => {
    expect(RUNNER).toMatch(/has changed since it was applied/);
    expect(RUNNER).toMatch(/recorded/);
    expect(RUNNER).toMatch(/supabase db reset/);
  });

  // An override would become the habit and the guarantee would erode.
  it('offers no force flag', () => {
    expect(RUNNER).not.toMatch(/--force/);
  });

  it('records a row for each applied migration', () => {
    expect(RUNNER).toMatch(/INSERT INTO public\.applied_migrations/);
    expect(RUNNER).toMatch(/'migrate-client'/);
  });

  it('supports an explicit adopt for a database with no prior bookkeeping', () => {
    expect(RUNNER).toMatch(/--adopt/);
  });
});
