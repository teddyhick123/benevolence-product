// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(__dirname, '..', '..', 'scripts/import-org.ts'), 'utf8');

// Import statements list these names in their own order, which says nothing
// about when they run. Ordering assertions look at the function body only.
const CLI = SOURCE.slice(SOURCE.indexOf('async function main'));

describe('import CLI', () => {
  it('verifies the archive before opening a transaction', () => {
    expect(CLI.indexOf('readArchive')).toBeLessThan(CLI.indexOf('withTransaction'));
  });

  it('refuses an incompatible schema before loading', () => {
    expect(SOURCE).toMatch(/checkSchemaCompatibility/);
    expect(SOURCE).toMatch(/assertOrgAbsent/);
  });

  // Object storage has no rollback, so documents go up only once the rows are
  // committed. The reverse order would orphan files behind a failed import.
  it('uploads documents after the transaction commits', () => {
    expect(CLI.indexOf('withTransaction')).toBeLessThan(CLI.indexOf('uploadDocuments'));
  });

  it('exits non-zero when the import fails', () => {
    expect(SOURCE).toMatch(/process\.exit\(1\)/);
  });
});
