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
  it('verify:unit uses Vitest 4 related-mode for ordinary source changes', () => {
    // `related <files> --run`, NOT the broken `run related <files>` (which vitest
    // treats as filename filters and fails closed with "No test files found").
    const argv = CHECK_COMMANDS['verify:unit'].argv({ changedFiles: ['lib/b.ts','lib/a.ts'] });
    expect(argv).toEqual(['npx','vitest','related','lib/a.ts','lib/b.ts','--run']);
    // guard against a regression to the invalid sibling-command ordering
    expect(argv.indexOf('run')).toBe(-1);
  });
  it('verify:unit resolves extra suite globs via a bash wrapper for migration changes', () => {
    // The schema-contract suite is a glob-free literal, but any extra suite
    // routes verify:unit through bash so glob patterns can shell-expand.
    const argv = CHECK_COMMANDS['verify:unit'].argv({ changedFiles: ['db/migrations/0057_x.sql'] });
    expect(argv.slice(0, 2)).toEqual(['bash','-lc']);
    const script = argv[2];
    expect(script).toContain('vitest related');
    expect(script).toContain('tests/integration/builder-schema-contract.test.ts');
    expect(script).toContain('--run');
    // migration-only change: no related source files, so no positionals beyond $0
    expect(argv.slice(3)).toEqual(['bash']);
  });
  it('verify:unit passes proposal source files as bash positionals, not interpolated', () => {
    // app/api/ touch -> API contract glob (needs shell expansion) + the changed
    // route as a "$@" positional (never spliced into the script -> injection-safe).
    const argv = CHECK_COMMANDS['verify:unit'].argv({ changedFiles: ['app/api/org/[orgId]/x/route.ts'] });
    expect(argv.slice(0, 2)).toEqual(['bash','-lc']);
    const script = argv[2];
    expect(script).toContain('related "$@"');
    expect(script).toContain('tests/integration/*.test.ts');
    // the proposal path is a trailing positional, absent from the script string
    expect(argv.slice(3)).toEqual(['bash','app/api/org/[orgId]/x/route.ts']);
    expect(script).not.toContain('app/api/org/[orgId]/x/route.ts');
  });
  it('verify:build sets production env overrides', () => {
    expect(CHECK_COMMANDS['verify:build'].envOverrides).toMatchObject({ NODE_ENV: 'production' });
  });
});

describe('unitTestTargets', () => {
  it('separates related source files from extra suites', () => {
    const t = unitTestTargets(['lib/builder/tools.ts','db/migrations/0057_x.sql']);
    expect(t.relatedFiles).toEqual(['lib/builder/tools.ts']);
    expect(t.extraSuiteGlobs).toContain('tests/integration/builder-schema-contract.test.ts');
  });

  it('adds the api contract suite glob when app/api/ is touched', () => {
    const t = unitTestTargets(['app/api/org/[orgId]/x/route.ts']);
    expect(t.extraSuiteGlobs).toContain('tests/integration/*.test.ts');
  });

  it('adds the integration suite glob when an integration test changes', () => {
    const t = unitTestTargets(['tests/integration/tax-contributions.auth.test.ts']);
    expect(t.extraSuiteGlobs).toContain('tests/integration/*.test.ts');
  });

  it('adds the client-data contract for browser and domain-hook changes', () => {
    for (const changed of [
      'components/tax/Card.tsx',
      'contexts/ModuleContext.tsx',
      'app/dashboard/page.tsx',
      'lib/holdings/hooks.ts',
      'lib/hooks/useWidgetDimensions.ts',
    ]) {
      expect(unitTestTargets([changed]).extraSuiteGlobs)
        .toContain('tests/integration/client-data-contract.test.ts');
    }
    expect(unitTestTargets(['app/api/org/[orgId]/x/route.ts']).extraSuiteGlobs)
      .not.toContain('tests/integration/client-data-contract.test.ts');
  });
});

describe('package.json verify scripts contract', () => {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  it.each([
    ['verify:types', 'node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit'],
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
