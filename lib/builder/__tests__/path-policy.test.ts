// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  evaluatePathPolicy,
  evaluateFileBudget,
  formatPathPolicyViolations,
  PROPOSAL_FILE_BUDGET,
} from '@/lib/builder/path-policy';

function rules(paths: string[]): string[] {
  return evaluatePathPolicy(paths).violations.map(v => v.rule);
}

describe('evaluatePathPolicy', () => {
  it('allows ordinary product source paths', () => {
    const result = evaluatePathPolicy([
      'components/volunteer/VolunteerList.tsx',
      'app/api/org/[orgId]/volunteer-tracking/route.ts',
      'app/dashboard/volunteer-tracking/page.tsx',
      'lib/modules/registry.ts',
      'lib/database.types.ts',
      'db/migrations/0057_volunteer_tracking.sql',
    ]);
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('denies GitHub workflow and repository configuration', () => {
    expect(rules(['.github/workflows/deploy.yml'])).toContain('protected-directory');
    expect(rules(['.git/hooks/pre-commit'])).toContain('protected-directory');
  });

  it('denies env and secret files anywhere in the tree', () => {
    expect(rules(['.env'])).toContain('env-file');
    expect(rules(['.env.local'])).toContain('env-file');
    expect(rules(['config/.env.production'])).toContain('env-file');
  });

  it('denies lockfiles and dependency manifests', () => {
    expect(rules(['package-lock.json'])).toContain('lockfile');
    expect(rules(['yarn.lock'])).toContain('lockfile');
    expect(rules(['package.json'])).toContain('protected-file');
  });

  it('denies changes to repository agent policy', () => {
    expect(rules(['AGENTS.md'])).toContain('protected-file');
    expect(rules(['CLAUDE.md'])).toContain('protected-file');
  });

  it('denies deployment configuration', () => {
    expect(rules(['vercel.json'])).toContain('deployment-config');
    expect(rules(['Dockerfile'])).toContain('deployment-config');
    expect(rules(['ops/docker-compose.yml'])).toContain('deployment-config');
  });

  it('denies auth/security primitives and protected directories', () => {
    expect(rules(['lib/supabase.ts'])).toContain('protected-file');
    expect(rules(['lib/org-capabilities.ts'])).toContain('protected-file');
    expect(rules(['app/middleware.ts'])).toContain('protected-file');
    expect(rules(['scripts/deploy.sh'])).toContain('protected-directory');
  });

  it('denies changes to shared browser transport infrastructure', () => {
    expect(rules(['lib/api/client.ts'])).toContain('protected-file');
    expect(rules(['lib/api/client-hooks.ts'])).toContain('protected-file');
  });

  it('denies rewriting an existing migration', () => {
    // 0001 exists on disk in this repo.
    expect(rules(['db/migrations/0001_extensions_and_shared_infra.sql'])).toContain('migration-rewrite');
  });

  it('denies non-canonical names under db/migrations/', () => {
    expect(rules(['db/migrations/notes.md'])).toContain('migration-rewrite');
    expect(rules(['db/migrations/patch.sql'])).toContain('migration-rewrite');
  });

  it('requires generated database types with migration proposals', () => {
    expect(rules(['db/migrations/0057_volunteer_tracking.sql'])).toContain('migration-types');
    expect(rules([
      'db/migrations/0057_volunteer_tracking.sql',
      'lib/database.types.ts',
    ])).not.toContain('migration-types');
  });

  it('flags duplicate paths after normalization', () => {
    const result = evaluatePathPolicy(['./components/a.tsx', 'components/a.tsx']);
    expect(result.allowed).toBe(false);
    expect(result.violations.map(v => v.rule)).toContain('duplicate-path');
  });

  it('formats violations into a single human-readable string', () => {
    const { violations } = evaluatePathPolicy(['.env']);
    expect(formatPathPolicyViolations(violations)).toMatch(/\.env/);
  });
});

describe('evaluateFileBudget', () => {
  it('accepts files within budget', () => {
    expect(evaluateFileBudget([{ content: 'export {}' }])).toBeNull();
  });

  it('rejects too many files', () => {
    const files = Array.from({ length: PROPOSAL_FILE_BUDGET.maxFiles + 1 }, () => ({ content: 'x' }));
    expect(evaluateFileBudget(files)).toMatch(/limited to/);
  });

  it('rejects oversized total content', () => {
    const big = 'x'.repeat(PROPOSAL_FILE_BUDGET.maxTotalContentBytes + 1);
    expect(evaluateFileBudget([{ content: big }])).toMatch(/byte budget/);
  });
});
