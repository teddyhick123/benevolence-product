import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Directories that are never source code to validate
const EXCLUDED_DIRS = new Set(['__tests__', '.next', 'node_modules', 'graphify-out']);

function walkDir(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function readAllSources(dirs: string[]): string {
  const files = dirs
    .flatMap(dir => walkDir(dir))
    .filter(f => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });

  return files
    .map(f => {
      try {
        return readFileSync(f, 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

const appSrc = readAllSources([
  'app',
  'lib',
  'components',
]);

describe('Schema contract: RPC function names', () => {
  it('no calls to non-existent org_role RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]org_role['"]/);
  });

  it('no calls to non-existent is_admin RPC', () => {
    expect(appSrc).not.toMatch(/rpc\(['"]is_admin['"]/);
  });

  it('no calls to org_has_module with p_module_id (should be p_module)', () => {
    expect(appSrc).not.toMatch(/p_module_id:/);
  });
});

describe('Schema contract: column names in donor components', () => {
  // Donor/contributions context: excludes portfolio and tax routes where
  // tax_contributions table legitimately has a contribution_type column,
  // and excludes admin import mapping labels.
  const donorSrc = readAllSources([
    'components/donors',
    'app/org',
    'app/dashboard/donors',
    'app/api/org',
  ]);

  it('no donor_type references (field is is_organization boolean)', () => {
    expect(donorSrc).not.toMatch(/donor_type/);
  });

  it('no contribution_type references (field is gift_type)', () => {
    expect(donorSrc).not.toMatch(/contribution_type/);
  });
});
