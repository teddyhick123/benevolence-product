// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHECK_KEYS, CHECK_COMMANDS, requiredCheckKeys, unitTestTargets, isLintablePath } from '@/lib/builder/check-matrix';

describe('requiredCheckKeys', () => {
  it('always requires types/lint/unit', () => {
    expect(requiredCheckKeys(['lib/foo.ts'])).toEqual(['verify:types','verify:lint','verify:unit']);
  });
  it('adds verify:migrations for db/migrations paths', () => {
    expect(requiredCheckKeys(['db/migrations/0057_x.sql'])).toContain('verify:migrations');
    expect(requiredCheckKeys(['db/legacy/old.sql'])).not.toContain('verify:migrations');
  });
  it.each([
    ['app/api/org/[orgId]/x/route.ts', true],
    ['components/tax/Card.tsx', true],
    ['contexts/ModuleContext.tsx', true],
    ['middleware.ts', true],
    ['next.config.js', true],
    ['tsconfig.scripts.json', true],
    ['lib/tax/calc.ts', false],
    ['docs/README.md', false],
  ])('verify:build required for %s -> %s', (p, expected) => {
    expect(requiredCheckKeys([p]).includes('verify:build')).toBe(expected);
  });
  it('is stable/sorted and deduplicated for mixed manifests', () => {
    const keys = requiredCheckKeys(['db/migrations/0057_x.sql','app/page.tsx','lib/a.ts','lib/a.ts']);
    expect(keys).toEqual(['verify:types','verify:lint','verify:unit','verify:migrations','verify:build']);
  });
});

describe('CHECK_COMMANDS', () => {
  it('covers every key with sane specs', () => {
    for (const key of CHECK_KEYS) {
      const spec = CHECK_COMMANDS[key];
      expect(spec.key).toBe(key);
      expect(spec.timeoutMs).toBeGreaterThanOrEqual(300000);
      expect(spec.versionArgv.length).toBeGreaterThan(0);
    }
  });
  it('scopes lint argv to lintable changed files, sorted', () => {
    const argv = CHECK_COMMANDS['verify:lint'].argv({ changedFiles: ['b.tsx','a.ts','x.sql','img.png'] });
    expect(argv).toEqual(['npx','eslint','a.ts','b.tsx']);
  });
  it('returns empty argv for lint when nothing is lintable', () => {
    expect(CHECK_COMMANDS['verify:lint'].argv({ changedFiles: ['db/migrations/0057_x.sql'] })).toEqual([]);
  });
  it('verify:unit falls back to builder suites when selection is empty', () => {
    const argv = CHECK_COMMANDS['verify:unit'].argv({ changedFiles: [] });
    expect(argv).toEqual(['npx','vitest','run','lib/builder']);
  });
  it('verify:unit adds schema-contract suite for migration changes', () => {
    const argv = CHECK_COMMANDS['verify:unit'].argv({ changedFiles: ['db/migrations/0057_x.sql'] });
    expect(argv).toContain('app/api/__tests__/builder-schema-contract.test.ts');
  });
  it('verify:build sets production env overrides', () => {
    expect(CHECK_COMMANDS['verify:build'].envOverrides).toMatchObject({ NODE_ENV: 'production' });
  });
});

describe('unitTestTargets', () => {
  it('separates related source files from extra suites', () => {
    const t = unitTestTargets(['lib/builder/tools.ts','db/migrations/0057_x.sql']);
    expect(t.relatedFiles).toEqual(['lib/builder/tools.ts']);
    expect(t.extraSuiteGlobs).toContain('app/api/__tests__/builder-schema-contract.test.ts');
  });
});

describe('package.json verify scripts contract', () => {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  it.each([
    ['verify:types', 'tsc --noEmit'],
    ['verify:lint', /^eslint /],
    ['verify:unit', /^vitest run/],
    ['verify:migrations', /^supabase db reset && bash scripts\/verify\/migrations-assert\.sh$/],
    ['verify:build', 'next build'],
  ])('%s exists and matches', (name, matcher) => {
    const script = pkg.scripts[name];
    expect(script).toBeTruthy();
    if (matcher instanceof RegExp) expect(script).toMatch(matcher);
    else expect(script).toBe(matcher);
  });
});
