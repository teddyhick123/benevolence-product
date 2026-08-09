// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routesRoot = path.join(root, 'app/api/org/[orgId]/ai-settings');

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? files(item) : entry.name === 'route.ts' ? [item] : [];
  });
}

describe('organization AI settings boundaries', () => {
  it.each(files(routesRoot))('%s proves organization-admin access', file => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain("requireOrgAccess(orgId, 'admin')");
    expect(source).toContain('isAccessDenied(access)');
  });

  it.each(files(routesRoot))('%s never reads credential storage or key-ring environment', file => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toContain("from('org_ai_credentials')");
    expect(source).not.toContain('encrypted_payload');
    expect(source).not.toContain('secret_fingerprint');
    expect(source).not.toContain('AI_CREDENTIAL_ENCRYPTION_KEYS');
  });

  it('keeps credential table access inside its dedicated repository', () => {
    const implementationRoots = ['app', 'components', 'lib'];
    const offenders = implementationRoots.flatMap(directory => {
      const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true })
        .flatMap(entry => {
          const item = path.join(current, entry.name);
          if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(item);
          if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
          return readFileSync(item, 'utf8').includes("from('org_ai_credentials')") ? [item] : [];
        });
      return walk(path.join(root, directory));
    });
    expect(offenders.map(file => path.relative(root, file))).toEqual([
      'lib/api/repositories/ai-credentials.ts',
    ]);
  });
});
