// lib/builder/verification-runner.ts
//
// Builder Increment 3 — isolated deterministic verifier.
//
// The security-critical isolation boundary between untrusted Builder proposal
// content and the worker host. LocalWorktreeRunner checks out a pinned base
// commit into a throwaway `git worktree`, writes the proposal's file manifest
// into it, then runs each required check (types/lint/unit/migrations/build) as
// a SCRUBBED subprocess — buildSandboxEnv strips every host secret before any
// proposal-modified code executes.
//
// Every git and tool invocation is routed through an injectable ProcessExecutor
// so this module can be unit-tested without touching real git or spawning real
// subprocesses (see __tests__/verification-runner.test.ts). Task 4 exercises the
// same runner against real git + real subprocesses.
//
// Design decisions where the brief left room for judgment (Task 4 relies on
// these exact behaviors):
//   - Worktree directory naming: `<tmpRoot>/builder-verify-<uuid>`.
//   - Git/tool invocations run with the HOST env (they operate on the host repo
//     and, for `git fetch`, need host credentials — the one permitted use).
//     Only CHECK/version subprocesses get buildSandboxEnv output.
//   - Setup-failure → check-status mapping (plan-mandated):
//       no_base_sha            → every required check `error`
//         (checks never even got a chance to attempt anything).
//       worktree                → every required check `error`
//         (infra failure establishing the base; not pinned by the plan, kept
//         as `error` per Task 3 code-review confirmation).
//       path_policy, file_budget, patch → every required check `skipped`
//         (setup failures after the worktree exists but before checks run —
//         a deliberate "we chose not to run", not an infra error).
//   - node_modules symlink is best-effort: a failure surfaces as failed checks,
//     not a crashed run (there is no dedicated setup-failure stage for it).
//   - Empty argv (e.g. lint with no lintable files) → `passed` with exitCode 0,
//     commandVersion null, log 'no applicable files for this check', no spawn.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { CHECK_KEYS, CHECK_COMMANDS, type CheckKey } from './check-matrix';
import { buildSandboxEnv } from './sandbox-env';
import {
  evaluatePathPolicy,
  evaluateFileBudget,
  formatPathPolicyViolations,
  normalizeProposalPath,
} from './path-policy';

// ============================================================
// Public types
// ============================================================

export interface CheckExecution {
  key: CheckKey;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  exitCode: number | null;
  durationMs: number;
  commandVersion: string | null; // from versionArgv, best-effort
  log: string; // raw, uncapped — persistence layer caps/redacts
  startedAt: string; // ISO
  completedAt: string; // ISO
}

export interface VerificationInput {
  baseSha: string | null;
  files: Array<{ path: string; content: string }>;
  requiredKeys: CheckKey[];
}

export interface VerificationOutcome {
  checks: CheckExecution[];
  /** null when patch/worktree setup succeeded */
  setupFailure: {
    stage: 'no_base_sha' | 'worktree' | 'path_policy' | 'file_budget' | 'patch';
    detail: string;
  } | null;
  authoritativeDiff: string | null; // unified diff from `git diff --cached`, null on setup failure
}

export interface VerificationRunner {
  run(input: VerificationInput): Promise<VerificationOutcome>;
}

/** Injectable process/git seams so unit tests never touch real git or spawn. */
export interface ProcessExecutor {
  exec(
    argv: string[],
    opts: { cwd: string; env: Record<string, string>; timeoutMs: number }
  ): Promise<{ exitCode: number | null; output: string; timedOut: boolean }>;
}

type ExecResult = { exitCode: number | null; output: string; timedOut: boolean };

// ============================================================
// Constants
// ============================================================

const NO_BASE_SHA_MSG = 'no pinned base SHA available';
const NO_APPLICABLE_FILES_MSG = 'no applicable files for this check';

/** Git plumbing (cat-file, fetch, worktree add/remove/prune, add -A, diff). */
const GIT_TIMEOUT_MS = 120_000;
/** Best-effort tool-version probe. */
const VERSION_TIMEOUT_MS = 30_000;
/** In-memory output capture ceiling per subprocess for the default executor. */
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
/** Grace between SIGTERM and SIGKILL on timeout for the default executor. */
const KILL_GRACE_MS = 5_000;

// ============================================================
// Helpers
// ============================================================

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface CheckFields {
  exitCode: number | null;
  commandVersion: string | null;
  log: string;
  startedAt: Date;
  completedAt: Date;
}

function makeCheck(key: CheckKey, status: CheckExecution['status'], f: CheckFields): CheckExecution {
  return {
    key,
    status,
    exitCode: f.exitCode,
    durationMs: Math.max(0, f.completedAt.getTime() - f.startedAt.getTime()),
    commandVersion: f.commandVersion,
    log: f.log,
    startedAt: f.startedAt.toISOString(),
    completedAt: f.completedAt.toISOString(),
  };
}

/** One CheckExecution per required key, all with the same terminal status/log. */
function bulkChecks(keys: CheckKey[], status: CheckExecution['status'], log: string): CheckExecution[] {
  const at = new Date();
  return keys.map((key) =>
    makeCheck(key, status, { exitCode: null, commandVersion: null, log, startedAt: at, completedAt: at })
  );
}

// ============================================================
// LocalWorktreeRunner
// ============================================================

export class LocalWorktreeRunner implements VerificationRunner {
  private readonly repoRoot: string;
  private readonly executor: ProcessExecutor;
  private readonly tmpRoot: string;

  constructor(opts: { repoRoot: string; executor?: ProcessExecutor; tmpRoot?: string }) {
    this.repoRoot = opts.repoRoot;
    this.executor = opts.executor ?? defaultProcessExecutor();
    this.tmpRoot = opts.tmpRoot ?? os.tmpdir();
  }

  async run(input: VerificationInput): Promise<VerificationOutcome> {
    const requiredSet = new Set(input.requiredKeys);
    // Deterministic CHECK_KEYS order, deduplicated, regardless of input order.
    const orderedRequired = CHECK_KEYS.filter((key) => requiredSet.has(key));

    // ---- Step 1: null baseSha fails closed (zero executor calls) ----
    if (input.baseSha === null) {
      return {
        checks: bulkChecks(orderedRequired, 'error', NO_BASE_SHA_MSG),
        setupFailure: { stage: 'no_base_sha', detail: NO_BASE_SHA_MSG },
        authoritativeDiff: null,
      };
    }
    const baseSha = input.baseSha;

    // ---- Step 2: verify the base commit is present (fetch once if not) ----
    const present = await this.ensureShaPresent(baseSha);
    if (!present) {
      const detail = `base commit ${baseSha} is not present and could not be fetched`;
      return {
        checks: bulkChecks(orderedRequired, 'error', detail),
        setupFailure: { stage: 'worktree', detail },
        authoritativeDiff: null,
      };
    }

    // ---- Step 3: create a detached worktree at the pinned commit ----
    const worktreeDir = path.join(this.tmpRoot, `builder-verify-${randomUUID()}`);
    const addArgv = ['git', 'worktree', 'add', '--detach', worktreeDir, baseSha];
    let addResult: ExecResult;
    try {
      addResult = await this.git(addArgv);
    } catch (err) {
      const detail = `git worktree add failed: ${errMsg(err)}`;
      return {
        checks: bulkChecks(orderedRequired, 'error', detail),
        setupFailure: { stage: 'worktree', detail },
        authoritativeDiff: null,
      };
    }
    if (addResult.timedOut || addResult.exitCode !== 0) {
      const detail = `git worktree add failed (exit ${addResult.exitCode}): ${addResult.output}`.trim();
      return {
        checks: bulkChecks(orderedRequired, 'error', detail),
        setupFailure: { stage: 'worktree', detail },
        authoritativeDiff: null,
      };
    }

    // The worktree now exists — cleanup MUST run from here on, on every path.
    try {
      // ---- Step 4: link node_modules (best-effort) ----
      this.linkNodeModules(worktreeDir);

      // ---- Step 5: re-enforce path policy + file budget (defense in depth) ----
      const policy = evaluatePathPolicy(input.files.map((f) => f.path));
      if (!policy.allowed) {
        const detail = formatPathPolicyViolations(policy.violations);
        return {
          checks: bulkChecks(orderedRequired, 'skipped', detail),
          setupFailure: { stage: 'path_policy', detail },
          authoritativeDiff: null,
        };
      }
      const budget = evaluateFileBudget(input.files);
      if (budget) {
        return {
          checks: bulkChecks(orderedRequired, 'skipped', budget),
          setupFailure: { stage: 'file_budget', detail: budget },
          authoritativeDiff: null,
        };
      }

      // ---- Step 6: apply the manifest (full file contents, overwrite) ----
      try {
        for (const file of input.files) {
          const rel = normalizeProposalPath(file.path);
          const abs = path.join(worktreeDir, rel);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, file.content, 'utf8');
        }
      } catch (err) {
        const detail = `failed to apply proposal files: ${errMsg(err)}`;
        return {
          checks: bulkChecks(orderedRequired, 'skipped', detail),
          setupFailure: { stage: 'patch', detail },
          authoritativeDiff: null,
        };
      }

      // ---- Step 7: stage + capture the authoritative diff ----
      await this.gitInWorktree(worktreeDir, ['add', '-A']);
      const diffResult = await this.gitInWorktree(worktreeDir, ['diff', '--cached']);
      const authoritativeDiff = diffResult.output;

      // ---- Step 8: run every required check IN ORDER, no short-circuit ----
      const changedFiles = input.files.map((f) => normalizeProposalPath(f.path)).sort();
      const checks: CheckExecution[] = [];
      for (const key of orderedRequired) {
        checks.push(await this.runCheck(key, worktreeDir, changedFiles));
      }

      return { checks, setupFailure: null, authoritativeDiff };
    } finally {
      await this.cleanup(worktreeDir);
    }
  }

  // ----------------------------------------------------------
  // git plumbing (host env — operates on the host repo)
  // ----------------------------------------------------------

  private hostEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value;
    }
    return env;
  }

  private git(argv: string[], timeoutMs: number = GIT_TIMEOUT_MS): Promise<ExecResult> {
    return this.executor.exec(argv, { cwd: this.repoRoot, env: this.hostEnv(), timeoutMs });
  }

  /** `git -C <worktree> …`; never throws (add/diff hiccups must not crash a run). */
  private async gitInWorktree(worktreeDir: string, args: string[]): Promise<ExecResult> {
    try {
      return await this.git(['git', '-C', worktreeDir, ...args]);
    } catch {
      return { exitCode: null, output: '', timedOut: false };
    }
  }

  private async ensureShaPresent(sha: string): Promise<boolean> {
    const catFile = ['git', 'cat-file', '-e', `${sha}^{commit}`];
    if (await this.gitOk(catFile)) return true;
    // Best-effort host-side fetch (the one permitted use of host credentials).
    await this.gitTry(['git', 'fetch', 'origin', sha]);
    return this.gitOk(catFile);
  }

  private async gitOk(argv: string[]): Promise<boolean> {
    try {
      const r = await this.git(argv);
      return r.exitCode === 0 && !r.timedOut;
    } catch {
      return false;
    }
  }

  private async gitTry(argv: string[]): Promise<void> {
    try {
      await this.git(argv);
    } catch {
      /* best-effort */
    }
  }

  private linkNodeModules(worktreeDir: string): void {
    try {
      const src = path.join(this.repoRoot, 'node_modules');
      const dest = path.join(worktreeDir, 'node_modules');
      if (!fs.existsSync(src)) return; // nothing to link
      if (!fs.existsSync(worktreeDir)) return; // worktree not materialized (unit fake) — skip
      if (fs.existsSync(dest)) return; // base already tracks node_modules — skip
      fs.symlinkSync(src, dest, 'dir');
    } catch {
      // Best-effort: a missing symlink surfaces as failed checks, not a crashed run.
    }
  }

  private async cleanup(worktreeDir: string): Promise<void> {
    await this.gitTry(['git', 'worktree', 'remove', '--force', worktreeDir]);
    await this.gitTry(['git', 'worktree', 'prune']);
  }

  // ----------------------------------------------------------
  // check execution (sandbox env — runs proposal-modified code)
  // ----------------------------------------------------------

  private async runCheck(key: CheckKey, worktreeDir: string, changedFiles: string[]): Promise<CheckExecution> {
    const spec = CHECK_COMMANDS[key];
    const startedAt = new Date();
    const argv = spec.argv({ changedFiles });

    if (argv.length === 0) {
      return makeCheck(key, 'passed', {
        exitCode: 0,
        commandVersion: null,
        log: NO_APPLICABLE_FILES_MSG,
        startedAt,
        completedAt: new Date(),
      });
    }

    const env = buildSandboxEnv(process.env, spec.envOverrides);
    const commandVersion = await this.bestEffortVersion(spec.versionArgv, worktreeDir, env);

    try {
      const result = await this.executor.exec(argv, { cwd: worktreeDir, env, timeoutMs: spec.timeoutMs });
      const completedAt = new Date();
      if (result.timedOut) {
        return makeCheck(key, 'failed', {
          exitCode: result.exitCode,
          commandVersion,
          log: `${result.output}\n[timeout after ${spec.timeoutMs}ms]`,
          startedAt,
          completedAt,
        });
      }
      const status = result.exitCode === 0 ? 'passed' : 'failed';
      return makeCheck(key, status, {
        exitCode: result.exitCode,
        commandVersion,
        log: result.output,
        startedAt,
        completedAt,
      });
    } catch (err) {
      return makeCheck(key, 'error', {
        exitCode: null,
        commandVersion,
        log: errMsg(err),
        startedAt,
        completedAt: new Date(),
      });
    }
  }

  private async bestEffortVersion(
    versionArgv: string[],
    cwd: string,
    env: Record<string, string>
  ): Promise<string | null> {
    if (versionArgv.length === 0) return null;
    try {
      const r = await this.executor.exec(versionArgv, { cwd, env, timeoutMs: VERSION_TIMEOUT_MS });
      if (r.timedOut || r.exitCode !== 0) return null;
      const version = r.output.trim();
      return version.length > 0 ? version : null;
    } catch {
      return null;
    }
  }
}

// ============================================================
// Default (real) executor: child_process.spawn, no shell.
// ============================================================

/** child_process.spawn, kill-on-timeout (SIGKILL after grace), output capped at 5MB in-memory. */
export function defaultProcessExecutor(): ProcessExecutor {
  return {
    exec(argv, opts) {
      return new Promise<ExecResult>((resolve, reject) => {
        if (argv.length === 0) {
          reject(new Error('defaultProcessExecutor: empty argv'));
          return;
        }
        const [command, ...args] = argv;
        const spawnOpts: SpawnOptions = {
          cwd: opts.cwd,
          env: opts.env as NodeJS.ProcessEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        };
        const child = spawn(command, args, spawnOpts);

        const chunks: Buffer[] = [];
        let capturedBytes = 0;
        let capped = false;
        let timedOut = false;
        let settled = false;
        let killTimer: NodeJS.Timeout | null = null;

        const capture = (chunk: Buffer) => {
          if (capped) return;
          const remaining = MAX_OUTPUT_BYTES - capturedBytes;
          if (chunk.length <= remaining) {
            chunks.push(chunk);
            capturedBytes += chunk.length;
          } else {
            if (remaining > 0) {
              chunks.push(chunk.subarray(0, remaining));
              capturedBytes += remaining;
            }
            capped = true;
          }
        };
        child.stdout?.on('data', capture);
        child.stderr?.on('data', capture);

        const timeoutTimer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
        }, opts.timeoutMs);

        const clearTimers = () => {
          clearTimeout(timeoutTimer);
          if (killTimer) clearTimeout(killTimer);
        };

        child.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimers();
          reject(err);
        });

        child.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimers();
          let output = Buffer.concat(chunks).toString('utf8');
          if (capped) output += `\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
          resolve({ exitCode: code, output, timedOut });
        });
      });
    },
  };
}
