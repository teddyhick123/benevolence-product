// @vitest-environment node
//
// Task 3 — LocalWorktreeRunner orchestration (UNIT level).
//
// These tests pin the ORCHESTRATION LOGIC of LocalWorktreeRunner: the order
// of git/tool calls, the exact argv and env handed to every subprocess, error
// mapping, no-short-circuit check execution, and the finally-block cleanup
// guarantee. They inject a FakeExecutor so nothing here spawns real git or a
// real subprocess. Real-git / real-subprocess behavior (that a worktree is
// actually created, that `git diff --cached` reflects the written files, etc.)
// is covered by Task 4's integration suite — NOT here.
//
// Security note: the whole point of Task 2's buildSandboxEnv is that check
// subprocesses never see host secrets. Every test sets GITHUB_TOKEN in the
// host env and asserts it is absent from the env handed to each check/version
// subprocess. A test that skipped that assertion would miss a real regression.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LocalWorktreeRunner,
  type ProcessExecutor,
  type VerificationInput,
} from '@/lib/builder/verification-runner';
import { buildSandboxEnv } from '@/lib/builder/sandbox-env';

// ------------------------------------------------------------------
// FakeExecutor: scripted per-argv responses + a full call log.
// ------------------------------------------------------------------

type ExecResult = { exitCode: number | null; output: string; timedOut: boolean };
type Outcome = ExecResult | { __throw: string };

const OK: ExecResult = { exitCode: 0, output: '', timedOut: false };
const isThrow = (o: Outcome): o is { __throw: string } =>
  typeof (o as { __throw?: unknown }).__throw === 'string';

interface CallRecord {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

class FakeExecutor implements ProcessExecutor {
  calls: CallRecord[] = [];
  private rules: Array<{ match: (a: string[]) => boolean; queue: Outcome[]; sticky: Outcome }> = [];

  /**
   * Register scripted outcomes for argv matching `match`. When more than one
   * outcome is supplied they are consumed in order; the last supplied outcome
   * sticks for any further matches (e.g. cat-file: fail once, then pass).
   */
  when(match: (a: string[]) => boolean, ...outcomes: Outcome[]): this {
    const list = outcomes.length ? outcomes : [OK];
    this.rules.push({ match, queue: [...list], sticky: list[list.length - 1] });
    return this;
  }

  async exec(
    argv: string[],
    opts: { cwd: string; env: Record<string, string>; timeoutMs: number }
  ): Promise<ExecResult> {
    this.calls.push({ argv, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs });
    const rule = this.rules.find((r) => r.match(argv));
    const outcome: Outcome = rule ? (rule.queue.length > 1 ? rule.queue.shift()! : rule.sticky) : OK;
    if (isThrow(outcome)) throw new Error(outcome.__throw);
    return outcome;
  }
}

// argv matchers ----------------------------------------------------
const gitCatFile = (a: string[]) => a[0] === 'git' && a[1] === 'cat-file';
const gitFetch = (a: string[]) => a[0] === 'git' && a[1] === 'fetch';
const gitWorktreeAdd = (a: string[]) => a[0] === 'git' && a[1] === 'worktree' && a[2] === 'add';
const gitWorktreeRemove = (a: string[]) => a[0] === 'git' && a[1] === 'worktree' && a[2] === 'remove';
const gitWorktreePrune = (a: string[]) => a[0] === 'git' && a[1] === 'worktree' && a[2] === 'prune';
const gitDiffCached = (a: string[]) => a[0] === 'git' && a.includes('diff') && a.includes('--cached');
const exact = (argv: string[]) => (a: string[]) =>
  a.length === argv.length && a.every((v, i) => v === argv[i]);

// ------------------------------------------------------------------
// Fixture wiring: real temp tmpRoot (sanctioned by the brief), fake repoRoot
// so linkNodeModules never touches the actual repo, GITHUB_TOKEN in host env.
// ------------------------------------------------------------------

let tmpRoot: string;
const REPO_ROOT = '/fake/repo-root-does-not-exist';

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vrunner-'));
  process.env.GITHUB_TOKEN = 'ghp_secret_should_not_leak';
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRunner(fake: FakeExecutor): LocalWorktreeRunner {
  return new LocalWorktreeRunner({ repoRoot: REPO_ROOT, executor: fake, tmpRoot });
}

const ALL_KEYS: VerificationInput['requiredKeys'] = ['verify:types', 'verify:lint', 'verify:unit'];

// ==================================================================

describe('LocalWorktreeRunner — null baseSha fails closed', () => {
  it('errors every required check and makes zero executor calls', async () => {
    const fake = new FakeExecutor();
    const runner = makeRunner(fake);

    const outcome = await runner.run({ baseSha: null, files: [], requiredKeys: ALL_KEYS });

    expect(fake.calls).toHaveLength(0);
    expect(outcome.setupFailure).toEqual({
      stage: 'no_base_sha',
      detail: 'no pinned base SHA available',
    });
    expect(outcome.authoritativeDiff).toBeNull();
    expect(outcome.checks.map((c) => c.key)).toEqual(ALL_KEYS);
    expect(outcome.checks.every((c) => c.status === 'error')).toBe(true);
    expect(outcome.checks.every((c) => c.log === 'no pinned base SHA available')).toBe(true);
    expect(outcome.checks.every((c) => c.exitCode === null)).toBe(true);
  });
});

describe('LocalWorktreeRunner — happy path orchestration', () => {
  const files = [{ path: 'lib/sample/foo.ts', content: 'export const x = 1;\n' }];

  function happyFake(): FakeExecutor {
    return new FakeExecutor()
      .when(gitDiffCached, { exitCode: 0, output: 'AUTHORITATIVE-DIFF-BODY', timedOut: false })
      .when(exact(['npx', 'tsc', '--version']), { exitCode: 0, output: 'Version 5.9.2\n', timedOut: false });
    // everything else defaults to OK (exit 0)
  }

  it('calls git + checks in the exact expected order with the worktree cwd', async () => {
    const fake = happyFake();
    const outcome = await makeRunner(fake).run({ baseSha: 'abc123', files, requiredKeys: ALL_KEYS });

    // git preamble
    expect(fake.calls[0].argv).toEqual(['git', 'cat-file', '-e', 'abc123^{commit}']);
    expect(fake.calls[1].argv.slice(0, 4)).toEqual(['git', 'worktree', 'add', '--detach']);
    const worktreeDir = fake.calls[1].argv[4];
    expect(worktreeDir.startsWith(path.join(tmpRoot, 'builder-verify-'))).toBe(true);
    expect(fake.calls[1].argv[5]).toBe('abc123');

    expect(fake.calls[2].argv).toEqual(['git', '-C', worktreeDir, 'add', '-A']);
    expect(fake.calls[3].argv).toEqual(['git', '-C', worktreeDir, 'diff', '--cached']);

    // per-check: version THEN command, cwd = worktreeDir
    expect(fake.calls[4].argv).toEqual(['npx', 'tsc', '--version']);
    expect(fake.calls[5].argv).toEqual(['npx', 'tsc', '--noEmit']);
    expect(fake.calls[6].argv).toEqual(['npx', 'eslint', '--version']);
    expect(fake.calls[7].argv).toEqual(['npx', 'eslint', 'lib/sample/foo.ts']);
    expect(fake.calls[8].argv).toEqual(['npx', 'vitest', '--version']);
    expect(fake.calls[9].argv).toEqual(['npx', 'vitest', 'run', 'related', 'lib/sample/foo.ts']);
    for (const i of [4, 5, 6, 7, 8, 9]) {
      expect(fake.calls[i].cwd).toBe(worktreeDir);
    }

    // cleanup runs last (finally)
    const last = fake.calls.slice(-2).map((c) => c.argv);
    expect(last[0]).toEqual(['git', 'worktree', 'remove', '--force', worktreeDir]);
    expect(last[1]).toEqual(['git', 'worktree', 'prune']);

    // outcome
    expect(outcome.setupFailure).toBeNull();
    expect(outcome.authoritativeDiff).toBe('AUTHORITATIVE-DIFF-BODY');
    expect(outcome.checks.map((c) => c.status)).toEqual(['passed', 'passed', 'passed']);
    expect(outcome.checks[0].commandVersion).toBe('Version 5.9.2');
  });

  it('scrubs host secrets from every check/version subprocess env', async () => {
    const fake = happyFake();
    await makeRunner(fake).run({ baseSha: 'abc123', files, requiredKeys: ALL_KEYS });

    // calls 4..9 are the version + command subprocesses
    for (const i of [4, 5, 6, 7, 8, 9]) {
      expect(fake.calls[i].env.GITHUB_TOKEN).toBeUndefined();
      expect(fake.calls[i].env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(fake.calls[i].env.SUPABASE_SERVICE_ROLE).toBeUndefined();
    }
    // exact env equality against the sandbox builder (verify:types has no overrides)
    expect(fake.calls[5].env).toEqual(buildSandboxEnv(process.env));
  });
});

describe('LocalWorktreeRunner — verify:build env overrides', () => {
  it('layers NODE_ENV=production onto the scrubbed env, still no secrets', async () => {
    const fake = new FakeExecutor();
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: 'app/page.tsx', content: 'export default function P(){return null}\n' }],
      requiredKeys: ['verify:build'],
    });

    const buildCmd = fake.calls.find((c) => c.argv.join(' ') === 'npx next build');
    expect(buildCmd).toBeDefined();
    expect(buildCmd!.env.GITHUB_TOKEN).toBeUndefined();
    expect(buildCmd!.env.NODE_ENV).toBe('production');
    expect(buildCmd!.env.NEXT_TELEMETRY_DISABLED).toBe('1');
    expect(buildCmd!.env).toEqual(
      buildSandboxEnv(process.env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' })
    );
    expect(outcome.checks[0].status).toBe('passed');
  });
});

describe('LocalWorktreeRunner — empty argv short-circuits to passed with no subprocess', () => {
  it('marks a check passed without any executor call when its argv is empty', async () => {
    const fake = new FakeExecutor();
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: 'README.md', content: 'hi\n' }], // not lintable
      requiredKeys: ['verify:lint'],
    });

    expect(fake.calls.some((c) => c.argv[0] === 'npx' && c.argv[1] === 'eslint')).toBe(false);
    expect(outcome.checks).toHaveLength(1);
    expect(outcome.checks[0].status).toBe('passed');
    expect(outcome.checks[0].log).toBe('no applicable files for this check');
  });
});

describe('LocalWorktreeRunner — fetch on missing SHA', () => {
  it('fetches when cat-file fails, then proceeds once the SHA resolves', async () => {
    const fake = new FakeExecutor().when(
      gitCatFile,
      { exitCode: 1, output: '', timedOut: false }, // first: missing
      OK // after fetch: present
    );
    const outcome = await makeRunner(fake).run({
      baseSha: 'deadbeef',
      files: [{ path: 'lib/x.ts', content: 'export const x=1;\n' }],
      requiredKeys: ['verify:types'],
    });

    const catFileCalls = fake.calls.filter((c) => gitCatFile(c.argv));
    expect(catFileCalls.length).toBe(2);
    expect(fake.calls.some((c) => gitFetch(c.argv))).toBe(true);
    const fetchCall = fake.calls.find((c) => gitFetch(c.argv))!;
    expect(fetchCall.argv).toEqual(['git', 'fetch', 'origin', 'deadbeef']);
    // fetch uses HOST env (the one permitted use of host credentials)
    expect(fetchCall.env.GITHUB_TOKEN).toBe('ghp_secret_should_not_leak');

    expect(outcome.setupFailure).toBeNull();
    expect(outcome.checks[0].status).toBe('passed');
  });

  it('fails closed with a worktree setupFailure when the SHA is still missing after fetch', async () => {
    const fake = new FakeExecutor().when(gitCatFile, { exitCode: 1, output: '', timedOut: false }); // always missing
    const outcome = await makeRunner(fake).run({
      baseSha: 'deadbeef',
      files: [],
      requiredKeys: ['verify:types', 'verify:unit'],
    });

    expect(outcome.setupFailure?.stage).toBe('worktree');
    expect(outcome.authoritativeDiff).toBeNull();
    expect(outcome.checks.every((c) => c.status === 'error')).toBe(true);
    expect(fake.calls.some((c) => gitWorktreeAdd(c.argv))).toBe(false);
  });
});

describe('LocalWorktreeRunner — path policy defense-in-depth', () => {
  it('skips all checks and reports path_policy when a protected file is present', async () => {
    const fake = new FakeExecutor();
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: '.github/workflows/x.yml', content: 'evil\n' }],
      requiredKeys: ALL_KEYS,
    });

    expect(outcome.setupFailure?.stage).toBe('path_policy');
    expect(outcome.authoritativeDiff).toBeNull();
    expect(outcome.checks.map((c) => c.status)).toEqual(['skipped', 'skipped', 'skipped']);
    // no check subprocess ever ran
    expect(fake.calls.some((c) => c.argv[0] === 'npx')).toBe(false);
    // worktree was created, so cleanup still runs
    expect(fake.calls.some((c) => gitWorktreeRemove(c.argv))).toBe(true);
    expect(fake.calls.some((c) => gitWorktreePrune(c.argv))).toBe(true);
  });
});

describe('LocalWorktreeRunner — no short-circuit', () => {
  it('runs later checks even after an earlier check fails (exit 1)', async () => {
    const fake = new FakeExecutor().when(exact(['npx', 'eslint', 'lib/sample/foo.ts']), {
      exitCode: 1,
      output: 'lint error',
      timedOut: false,
    });
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: 'lib/sample/foo.ts', content: 'export const x=1;\n' }],
      requiredKeys: ALL_KEYS,
    });

    expect(outcome.checks.map((c) => c.status)).toEqual(['passed', 'failed', 'passed']);
    expect(outcome.checks[1].exitCode).toBe(1);
    expect(outcome.checks[1].log).toContain('lint error');
    // unit check (the one after the failure) actually executed
    expect(fake.calls.some((c) => c.argv.join(' ').startsWith('npx vitest run related'))).toBe(true);
  });
});

describe('LocalWorktreeRunner — timeout mapping', () => {
  it('maps a timed-out check to failed with a timeout marker in the log', async () => {
    const fake = new FakeExecutor().when(exact(['npx', 'tsc', '--noEmit']), {
      exitCode: null,
      output: 'partial',
      timedOut: true,
    });
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: 'lib/sample/foo.ts', content: 'export const x=1;\n' }],
      requiredKeys: ['verify:types'],
    });

    expect(outcome.checks[0].status).toBe('failed');
    expect(outcome.checks[0].log).toContain('partial');
    expect(outcome.checks[0].log).toContain('[timeout after 300000ms]');
  });
});

describe('LocalWorktreeRunner — cleanup guarantee when a check throws', () => {
  it('maps the throwing check to error, keeps running later checks, and still cleans up', async () => {
    const fake = new FakeExecutor().when(exact(['npx', 'tsc', '--noEmit']), {
      __throw: 'spawn ENOENT',
    });
    const outcome = await makeRunner(fake).run({
      baseSha: 'abc123',
      files: [{ path: 'lib/sample/foo.ts', content: 'export const x=1;\n' }],
      requiredKeys: ALL_KEYS,
    });

    expect(outcome.checks.map((c) => c.status)).toEqual(['error', 'passed', 'passed']);
    expect(outcome.checks[0].log).toContain('ENOENT');
    expect(outcome.checks[0].exitCode).toBeNull();

    // finally cleanup reached despite the throw
    const worktreeDir = fake.calls.find((c) => gitWorktreeAdd(c.argv))!.argv[4];
    expect(fake.calls.some((c) => c.argv.join(' ') === `git worktree remove --force ${worktreeDir}`)).toBe(true);
    expect(fake.calls.some((c) => gitWorktreePrune(c.argv))).toBe(true);
  });
});
