// @vitest-environment node
//
// Task 4 — LocalWorktreeRunner INTEGRATION (real git, real subprocesses).
//
// The unit suite (verification-runner.test.ts) pins the runner's orchestration
// logic against a scripted FakeExecutor and never touches git or spawns a real
// process. THIS suite is the exit-criteria evidence at the runner level: a tiny
// throwaway git repo built in a tmpdir, the REAL defaultProcessExecutor()
// (child_process.spawn), and real `npx tsc` / `npx eslint` invocations resolved
// against the project's own installed toolchain. No mocks for the executor.
//
// It is deliberately NOT env-gated — it needs only git + node + the project's
// installed tsc/eslint (no Docker, no BUILDER_VERIFY_HEAVY_TESTS flag), so it
// runs in plain `npx vitest run` / CI.
//
// node_modules wiring (the one non-obvious piece): the runner symlinks
// `<repoRoot>/node_modules` into each worktree so `npx tsc`/`npx eslint`
// resolve. Here `repoRoot` is the FIXTURE repo, whose own `node_modules` we
// point (via a symlink created after the base commit) at the project's REAL
// node_modules. That is exactly the production resolution mechanism, proven to
// work here rather than mocked away.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  LocalWorktreeRunner,
  defaultProcessExecutor,
  type VerificationInput,
} from '@/lib/builder/verification-runner';
import { buildSandboxEnv } from '@/lib/builder/sandbox-env';
import { sha256Hex } from '@/lib/builder/artifacts';

// vitest runs from the repo root, so the project's installed toolchain lives here.
const PROJECT_ROOT = process.cwd();
const REAL_NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');

let fixtureRepo: string; // repoRoot handed to LocalWorktreeRunner (real git history)
let tmpRoot: string; // where the runner materializes builder-verify-<uuid> worktrees
let baseSha: string; // pinned base commit of the fixture

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function makeRunner(): LocalWorktreeRunner {
  return new LocalWorktreeRunner({
    repoRoot: fixtureRepo,
    executor: defaultProcessExecutor(),
    tmpRoot,
  });
}

beforeAll(() => {
  // The whole point of the fixture is to run the REAL tsc/eslint; if they are
  // not installed there is nothing to integration-test.
  if (!fs.existsSync(path.join(REAL_NODE_MODULES, 'typescript'))) {
    throw new Error(`expected an installed typescript under ${REAL_NODE_MODULES}`);
  }

  // Prefixes deliberately avoid the substring 'builder-verify-' so the cleanup
  // assertion (test 5) can use it to match ONLY runner-created worktrees
  // (named builder-verify-<uuid>), never the fixture repo or tmpRoot itself.
  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-fixture-repo-'));
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-runner-tmproot-'));

  execFileSync('git', ['init', '-q'], { cwd: fixtureRepo });
  git(fixtureRepo, ['config', 'user.email', 'fixture@builder.test']);
  git(fixtureRepo, ['config', 'user.name', 'Builder Fixture']);
  git(fixtureRepo, ['config', 'commit.gpgsign', 'false']);

  // Minimal but real tsconfig. skipLibCheck + types:[] keep the program tiny and
  // independent of whatever @types happen to live in the symlinked real
  // node_modules — the TS2322 assignability error we assert on is a core check,
  // unaffected by either. (strict/noEmit/include:*.ts are the brief's shape.)
  fs.writeFileSync(
    path.join(fixtureRepo, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, types: [] },
      include: ['*.ts'],
    }) + '\n'
  );
  fs.writeFileSync(path.join(fixtureRepo, 'ok.ts'), 'export const n: number = 1;\n');
  // root:true stops eslint's legacy config discovery from walking up out of the
  // tmpdir worktree into any stray host config.
  fs.writeFileSync(
    path.join(fixtureRepo, '.eslintrc.json'),
    JSON.stringify({ root: true, rules: { 'no-debugger': 'error' } }) + '\n'
  );
  // Mirrors the real repo so the worktree inherits it.
  fs.writeFileSync(path.join(fixtureRepo, '.gitignore'), 'node_modules/\n');

  // verify:unit fixtures. These live in SUBDIRECTORIES so tsconfig's root-only
  // `include: ['*.ts']` never compiles them (they import 'vitest') — keeping the
  // verify:types tests above unaffected. Vitest runs them zero-config via the
  // symlinked real toolchain, exactly as the runner drives it in production.
  //
  //   unit/sum.ts + unit/sum.test.ts  -> the `related` dependency-graph case:
  //     a proposal that edits sum.ts must make vitest pick up and run sum.test.ts.
  fs.mkdirSync(path.join(fixtureRepo, 'unit'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, 'unit', 'sum.ts'),
    'export function sum(a: number, b: number): number {\n  return a + b;\n}\n'
  );
  fs.writeFileSync(
    path.join(fixtureRepo, 'unit', 'sum.test.ts'),
    [
      "import { describe, it, expect } from 'vitest';",
      "import { sum } from './sum';",
      "describe('sum', () => {",
      "  it('adds', () => {",
      '    expect(sum(2, 3)).toBe(5);',
      '  });',
      '});',
      '',
    ].join('\n')
  );
  //   tests/integration/contract.test.ts -> the extraSuiteGlobs case: a contract
  //     suite that imports NOTHING, so the ONLY way it runs is the integration
  //     glob shell-expanding inside the bash wrapper.
  fs.mkdirSync(path.join(fixtureRepo, 'tests', 'integration'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, 'tests', 'integration', 'contract.test.ts'),
    [
      "import { describe, it, expect } from 'vitest';",
      "describe('api-contract', () => {",
      "  it('holds', () => {",
      '    expect(1 + 1).toBe(2);',
      '  });',
      '});',
      '',
    ].join('\n')
  );

  git(fixtureRepo, ['add', '-A']);
  git(fixtureRepo, ['commit', '-qm', 'fixture base']);
  baseSha = git(fixtureRepo, ['rev-parse', 'HEAD']).trim();

  // Point the fixture's node_modules at the real installed toolchain. Created
  // AFTER the commit and gitignored, so it never enters the base tree; the
  // runner then symlinks it on into each worktree so `npx tsc`/`npx eslint`
  // resolve without any network install.
  fs.symlinkSync(REAL_NODE_MODULES, path.join(fixtureRepo, 'node_modules'), 'dir');
}, 60_000);

afterAll(() => {
  try {
    git(fixtureRepo, ['worktree', 'prune']);
  } catch {
    /* best-effort */
  }
  // Unlink the node_modules symlink explicitly before rm so the real toolchain
  // is never at risk (fs.rmSync does not follow symlinks, but be explicit).
  try {
    fs.unlinkSync(path.join(fixtureRepo, 'node_modules'));
  } catch {
    /* already gone */
  }
  for (const dir of [tmpRoot, fixtureRepo]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

describe('LocalWorktreeRunner integration — real git + real subprocesses', () => {
  // 1. Env scrubbing is real: a REAL node subprocess launched with the sandbox
  //    env cannot read GITHUB_TOKEN even though it is present in the host env.
  it('scrubs a host secret from a real subprocess launched with the sandbox env', async () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'fixture-secret-should-not-leak';
    try {
      const env = buildSandboxEnv(process.env);
      // belt: the secret is absent from the env object we hand to exec
      expect(env.GITHUB_TOKEN).toBeUndefined();

      // suspenders: the actual spawned process exits 7 iff it can see the token
      const result = await defaultProcessExecutor().exec(
        ['node', '-e', 'process.exit(process.env.GITHUB_TOKEN ? 7 : 0)'],
        { cwd: fixtureRepo, env, timeoutMs: 15_000 }
      );
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  }, 30_000);

  // 2. A deliberately broken type BLOCKS with reproducible TS2322 evidence.
  it('blocks a broken type with TS2322 in the check log', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      files: [{ path: 'broken.ts', content: 'export const n: number = "not a number";\n' }],
      requiredKeys: ['verify:types'],
    });

    expect(outcome.setupFailure).toBeNull();
    expect(outcome.checks).toHaveLength(1);
    const types = outcome.checks[0];
    expect(types.key).toBe('verify:types');
    expect(types.status).toBe('failed');
    expect(types.exitCode).not.toBe(0);
    expect(types.log).toContain('TS2322');
    // proves `npx tsc --version` resolved the real compiler via the symlink chain
    expect(types.commandVersion).toContain('Version');
  }, 120_000);

  // 3. A well-typed file PASSES.
  it('passes a well-typed file', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      files: [{ path: 'good.ts', content: 'export const total: number = 1 + 2;\n' }],
      requiredKeys: ['verify:types'],
    });

    expect(outcome.setupFailure).toBeNull();
    const types = outcome.checks[0];
    expect(types.status).toBe('passed');
    expect(types.exitCode).toBe(0);
    expect(types.commandVersion).toContain('Version');
  }, 120_000);

  // 4. A deliberately broken lint BLOCKS with the rule id in the log.
  it('blocks a lint violation with no-debugger in the check log', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      files: [{ path: 'bad.ts', content: 'debugger;\n' }],
      requiredKeys: ['verify:lint'],
    });

    expect(outcome.setupFailure).toBeNull();
    const lint = outcome.checks[0];
    expect(lint.key).toBe('verify:lint');
    expect(lint.status).toBe('failed');
    expect(lint.exitCode).not.toBe(0);
    expect(lint.log).toContain('no-debugger');
    // proves `npx eslint --version` resolved the real eslint via the symlink chain
    expect(lint.commandVersion).toMatch(/\d+\.\d+\.\d+/);
  }, 120_000);

  // 5. The throwaway worktree is cleaned up on EVERY exit path — success,
  //    check-failure, and a mid-try early return (path policy). No orphaned
  //    `git worktree` registrations and nothing left on disk.
  it('leaves no orphaned worktrees after success, check-failure, and early-return runs', async () => {
    // success (checks pass)
    await makeRunner().run({
      baseSha,
      files: [{ path: 'clean.ts', content: 'export const n: number = 5;\n' }],
      requiredKeys: ['verify:types'],
    });

    // check-failure (tsc exits non-zero, run completes, finally cleans up)
    const failed = await makeRunner().run({
      baseSha,
      files: [{ path: 'broken2.ts', content: 'export const n: number = "x";\n' }],
      requiredKeys: ['verify:types'],
    });
    expect(failed.checks[0].status).toBe('failed');

    // early return from inside the try (path policy) — a distinct failure exit
    // path that still must hit the finally cleanup
    const blocked = await makeRunner().run({
      baseSha,
      files: [{ path: '.github/workflows/evil.yml', content: 'jobs: {}\n' }],
      requiredKeys: ['verify:types'],
    });
    expect(blocked.setupFailure?.stage).toBe('path_policy');

    // no worktree registration references a builder-verify worktree
    const list = git(fixtureRepo, ['worktree', 'list']);
    expect(list).not.toContain('builder-verify-');
    // and nothing is left on disk in tmpRoot
    const leftovers = fs.readdirSync(tmpRoot).filter((d) => d.startsWith('builder-verify-'));
    expect(leftovers).toEqual([]);
  }, 180_000);

  // 6. The authoritative diff reflects the proposal ONLY (no node_modules infra
  //    leak) and its hash is stable across two identical runs.
  it('produces a proposal-only authoritative diff whose hash is deterministic', async () => {
    const input: VerificationInput = {
      baseSha,
      files: [{ path: 'diffcheck.ts', content: 'export const n: number = 1;\n' }],
      requiredKeys: ['verify:types'],
    };

    const a = await makeRunner().run(input);
    const b = await makeRunner().run(input);

    expect(a.authoritativeDiff).not.toBeNull();
    expect(a.authoritativeDiff).toContain('+export const n: number = 1;');
    expect(a.authoritativeDiff).toContain('b/diffcheck.ts');
    // the worktree's node_modules symlink must never leak into the record
    expect(a.authoritativeDiff).not.toContain('node_modules');
    // determinism: identical input -> byte-identical diff -> identical hash
    expect(sha256Hex(a.authoritativeDiff!)).toBe(sha256Hex(b.authoritativeDiff!));
  }, 180_000);

  // 7. Real timeout kill: defaultProcessExecutor actually terminates a process
  //    that outlives its timeout, resolving timedOut:true well under the clock.
  it('kills a real subprocess that outlives its timeout', async () => {
    const started = Date.now();
    const result = await defaultProcessExecutor().exec(
      ['node', '-e', 'setTimeout(() => {}, 60000)'],
      { cwd: fixtureRepo, env: buildSandboxEnv(process.env), timeoutMs: 1500 }
    );
    const elapsedMs = Date.now() - started;

    expect(result.timedOut).toBe(true);
    // killed by signal -> no clean exit code
    expect(result.exitCode).toBeNull();
    // the SIGTERM landed far below the process's own 60s lifetime
    expect(elapsedMs).toBeLessThan(10_000);
  }, 20_000);

  // 8. verify:unit runs the REAL scoped vitest invocation and PASSES: a proposal
  //    that edits unit/sum.ts (a non-test source file) must make Vitest 4's
  //    `related` mode discover and run unit/sum.test.ts. This is the dominant
  //    proposal shape the earlier `run related …` argv failed closed on.
  it('runs related-mode vitest for a source change and passes when the test holds', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      // return b + a === return a + b -> sum(2,3) still 5 -> test passes
      files: [{ path: 'unit/sum.ts', content: 'export function sum(a: number, b: number): number {\n  return b + a;\n}\n' }],
      requiredKeys: ['verify:unit'],
    });

    expect(outcome.setupFailure).toBeNull();
    expect(outcome.checks).toHaveLength(1);
    const unit = outcome.checks[0];
    expect(unit.key).toBe('verify:unit');
    expect(unit.status).toBe('passed');
    expect(unit.exitCode).toBe(0);
    // proves related-mode actually SELECTED and executed the associated test,
    // not that it trivially found zero files (which the old argv did)
    expect(unit.log).toContain('unit/sum.test.ts');
    expect(unit.log).toMatch(/1 passed/);
    // proves `npx vitest --version` resolved the real runner via the symlink chain
    expect(unit.commandVersion).toMatch(/\d+\.\d+\.\d+/);
  }, 120_000);

  // 9. The same path BLOCKS with reproducible assertion evidence when the edit
  //    breaks the related test — the gate this whole check exists to enforce.
  it('blocks a source change that breaks its related test, with the failing suite in the log', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      // return a - b -> sum(2,3) === -1 !== 5 -> unit/sum.test.ts assertion fails
      files: [{ path: 'unit/sum.ts', content: 'export function sum(a: number, b: number): number {\n  return a - b;\n}\n' }],
      requiredKeys: ['verify:unit'],
    });

    expect(outcome.setupFailure).toBeNull();
    const unit = outcome.checks[0];
    expect(unit.key).toBe('verify:unit');
    expect(unit.status).toBe('failed');
    expect(unit.exitCode).not.toBe(0);
    // reproducible evidence, mirroring the TS2322 / no-debugger patterns above
    expect(unit.log).toContain('unit/sum.test.ts');
    expect(unit.log).toMatch(/AssertionError|1 failed/);
  }, 120_000);

  // 10. The extraSuiteGlobs path is real: touching an app/api/ source file routes
  //     verify:unit through the bash wrapper, whose `tests/integration/*.test.ts`
  //     glob must shell-expand and actually RUN the contract suite — even though
  //     nothing imports the changed file, so `related` alone would run nothing.
  it('shell-expands the api contract glob and runs the contract suite for an app/api change', async () => {
    const outcome = await makeRunner().run({
      baseSha,
      files: [{ path: 'app/api/health/route.ts', content: 'export const dynamic = "force-dynamic";\n' }],
      requiredKeys: ['verify:unit'],
    });

    expect(outcome.setupFailure).toBeNull();
    const unit = outcome.checks[0];
    expect(unit.key).toBe('verify:unit');
    // the glob-expanded contract suite ran and passed
    expect(unit.status).toBe('passed');
    expect(unit.exitCode).toBe(0);
    // the ONLY reason this suite ran is the shell-expanded glob (nothing imports
    // the changed route) — its presence in the log proves expansion happened
    expect(unit.log).toContain('tests/integration/contract.test.ts');
  }, 120_000);
});
