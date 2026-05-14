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

function readAllSources(dirs: string[], extensions: string[] = ['.ts', '.tsx']): string {
  const files = dirs
    .flatMap(dir => walkDir(dir, extensions))
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

const migrationsSrc = readAllSources(['db/migrations'], ['.sql']);
const agentDocsSrc = ['CLAUDE.md', 'AGENTS.md']
  .map(file => {
    try {
      return readFileSync(file, 'utf-8');
    } catch {
      return '';
    }
  })
  .join('\n');

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

describe('Schema contract: module storage', () => {
  it('application code does not use removed organization_modules table', () => {
    expect(appSrc).not.toMatch(/from\(['"]organization_modules['"]/);
  });

  it('seed migration does not insert into removed modules table', () => {
    expect(migrationsSrc).not.toMatch(/INSERT\s+INTO\s+public\.modules/i);
  });

  it('agent docs do not describe organization_modules as active storage', () => {
    expect(agentDocsSrc).not.toMatch(/organization_modules` table tracks/i);
  });
});

describe('Schema contract: organization membership columns', () => {
  it('organization_members selects use org_id, not organization_id', () => {
    expect(appSrc).not.toMatch(/from\(['"]organization_members['"]\)[\s\S]{0,160}\.select\(\s*['"`][^'"`]*organization_id/);
  });
});

describe('Schema contract: pledge payment accounting', () => {
  it('created payment contributions are donor gifts, not pledge placeholders', () => {
    expect(migrationsSrc).not.toMatch(/p_pledge_id,\s*p_installment_id,\s*true/);
  });

  it('pledge schedule validation does not allow cent drift', () => {
    expect(appSrc).not.toMatch(/Installment amounts must sum to total_amount[\s\S]{0,160}<\s*0\.02/);
    expect(migrationsSrc).not.toMatch(/ABS\(v_inst_sum - p_total_amount\)\s*>\s*0\.01/);
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
