// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const API_ROOT = path.join(REPO_ROOT, 'app', 'api');
const ACTIVE_FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'legacy-service-role-routes.txt');
const BASELINE_FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'legacy-service-role-baseline.txt');
const FORBIDDEN_TOKENS = ['createAdminClient(', 'SUPABASE_SERVICE_ROLE'] as const;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return routeFiles(absolute);
    }
    return entry.name === 'route.ts'
      ? [path.relative(REPO_ROOT, absolute).split(path.sep).join('/')]
      : [];
  });
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function routesWithDirectElevatedAccess(): string[] {
  return routeFiles(API_ROOT)
    .filter((file) => {
      const source = withoutComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
      return FORBIDDEN_TOKENS.some((token) => source.includes(token));
    })
    .sort();
}

function fixture(file: string): string[] {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('API elevated-access boundary', () => {
  it('matches the explicit legacy route fixture exactly', () => {
    expect(routesWithDirectElevatedAccess()).toEqual(fixture(ACTIVE_FIXTURE_PATH));
  });

  it('keeps the fixture sorted, unique, and limited to existing route files', () => {
    const active = fixture(ACTIVE_FIXTURE_PATH);
    expect(active).toEqual([...new Set(active)].sort());
    for (const file of active) {
      expect(file).toMatch(/^app\/api\/.+\/route\.ts$/);
      expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true);
    }
  });

  it('allows only verified baseline paths and may only ratchet down', () => {
    const baseline = fixture(BASELINE_FIXTURE_PATH);
    const active = fixture(ACTIVE_FIXTURE_PATH);
    expect(baseline).toEqual([...new Set(baseline)].sort());
    expect(baseline).toHaveLength(111);
    expect(active.length).toBeLessThanOrEqual(baseline.length);
    for (const file of active) expect(baseline, file).toContain(file);
  });
});
