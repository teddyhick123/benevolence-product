# Builder Increment 3 — Isolated Deterministic Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builder-generated changes are applied and checked against a pinned source revision in an isolated, secret-scrubbed environment before any reviewer sees them, with per-check evidence recorded in `builder_verification_runs` and the review gate enforcing a class-scoped required-check matrix.

**Architecture:** A `VerificationRunner` adapter with one implementation this increment — `LocalWorktreeRunner` — which creates a detached `git worktree` at the revision's `base_commit_sha`, applies the revision's file manifest, generates the authoritative diff via `git diff`, and spawns each check command as a subprocess with an allowlisted (secret-free) environment, time limits, and output caps. A pure change-class matrix computes which of the five `verify:*` checks are required per revision; the worker records one `builder_verification_runs` row per required check; the existing `evaluateAttemptGate` (unchanged) fails any attempt whose required checks haven't all passed. `REVIEW_POLICY_VERSION` bumps to `v2`, automatically invalidating all v1 attempts.

**Tech Stack:** Node `child_process.spawn`, `git worktree`, TypeScript 5.5.4 (`tsc --noEmit`), ESLint 8.57.0 (legacy `.eslintrc.json`), Vitest 4 (`vitest related`), Supabase CLI (`supabase db reset`, local stack in `supabase/config.toml`), Next 15 (`next build`).

## Context

Increment 2 (merged 2026-07-16) built the durable data contract and left explicit hooks: the `builder_verification_runs` table (`db/migrations/0025_builder.sql:224-238`, `UNIQUE(review_attempt_id, check_key)`), the gate clause in `lib/builder/review-gate.ts:77-83` (every key in `attempt.required_check_keys` must have a run with `status==='passed'`; fail reason `'Required verification checks have not passed.'`), `REQUIRED_CHECK_KEYS: string[] = []` as a vacuous-pass placeholder (`lib/builder/proposal-state.ts:24`), `ARTIFACT_KEYS.checkLog(checkKey)` (`lib/builder/artifacts.ts:189`), and `reviewer_kind='deterministic_check'` in the findings CHECK. This increment populates all of it. It is audit Phase 2 — "the hard engineering".

**User decisions (binding):**
1. **Local runner only.** The Docker/disposable-container implementation is OUT OF SCOPE (future Increment 3b). No Dockerfile, no docker-compose. The adapter interface must let a container implementation slot in later without changing the worker call site. The security-critical properties (no production secrets in check subprocesses, no GitHub write capability, pinned read-only base) must hold in the local runner.
2. **Class-scoped required matrix, fail-closed.** `verify:types`, `verify:lint`, `verify:unit` always required. `verify:migrations` required only when the manifest touches `db/migrations/`. `verify:build` required only when the manifest touches `app/`, `components/`, `contexts/`, or `middleware.ts`/`next.config.*`/`tailwind.config.*`/`postcss.config.*`/`tsconfig*.json`/`package.json` (the config set is path-policy-denied anyway; the predicate still names it for completeness). A required check that cannot run (patch failure, missing base SHA, no local Supabase) records a non-`passed` status — the gate then blocks. Never skip-and-pass.

**Design decisions locked in this plan (rationale inline):**
- **Pinned checkout = `git worktree add --detach` from the worker's own repo checkout.** The Builder proposes changes to the same repository the worker runs from, so the worker's git object store already has (or can fetch) the base SHA. No tarball download needed. Host-side `git fetch` to obtain a missing SHA is allowed (that is host prep with the host's read credentials, not execution of generated code).
- **node_modules is symlinked from the worker checkout into the worktree.** Safe because `lib/builder/path-policy.ts` denies `package.json` and all lockfiles — a proposal can never change the dependency set.
- **Null `base_commit_sha` fails closed.** If the revision has no pinned base, every required check records `status='error'` with reason "no pinned base SHA" — the gate blocks. No fallback to HEAD, no guessing.
- **All required checks run to completion (no short-circuit on first failure)** so the reviewer gets full evidence; the gate does the failing. Exception: if patch application itself fails, the checks can't run — all required runs record `status='skipped'` with a shared log, plus one `deterministic_check`/`blocker` finding, and the gate blocks on the finding.
- **Verifier runs before the AI model review** (audit: "before any AI reviewer summarizes them"), and the model review still runs afterward so the reviewer sees both kinds of evidence. Existing worker Step 7 already loads verification runs for the gate — unchanged.
- **Authoritative diff:** after applying the manifest, `git add -A && git diff --cached` in the worktree produces the authoritative unified diff, uploaded as a NEW artifact `diff.authoritative.patch` under the revision prefix. It is NOT compared against the frozen `diff_hash` (that hash covers the Increment-2 synthesized empty-base diff, a different artifact by design — they will always differ, which is expected until the stored diff is replaced in a future increment). Its SHA-256 goes in the shared verification log.
- **Command table is the canonical check spec** (code, versioned, testable per the audit). The `verify:*` package.json scripts are developer-facing mirrors of the same commands; a contract test asserts they stay in sync.
- **`verify:migrations` resets the local walkthrough Supabase stack** (`supabase/config.toml`, project `benevolence-walkthrough`, migrations symlinked to `db/migrations`). This DESTROYS local walkthrough data by design — documented in ops docs. If the stack/Docker is unavailable, the check fails closed.

## Global Constraints

- Check keys are exactly: `verify:types`, `verify:lint`, `verify:unit`, `verify:migrations`, `verify:build` (existing gate tests already use `verify:types` — `lib/builder/__tests__/review-gate.test.ts:78,207,219,229`).
- `REVIEW_POLICY_VERSION` becomes `'builder-review-policy/v2'`. The `REQUIRED_CHECK_KEYS` constant is DELETED — required keys are computed per revision by `requiredCheckKeys(paths)`.
- Check subprocess environment is built ONLY by `buildSandboxEnv()` (allowlist). It must never contain: `SUPABASE_SERVICE_ROLE`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `REDIS_URL`, `DATABASE_URL`, or any var matching `/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i` that is not in the explicit allowlist. This is a tested security property, not a convention.
- No check subprocess may write to GitHub. The runner never passes GitHub credentials; `applyProposalToGitHub` is never invoked from verification code.
- Fail closed everywhere: any required check without a `status='passed'` run blocks (existing gate reason: `'Required verification checks have not passed.'` — do not change gate reason strings; `lib/builder/__tests__/review-gate.test.ts` asserts them).
- `builder_verification_runs` writes are idempotent upserts on `(review_attempt_id, check_key)` (existing UNIQUE constraint). Statuses: `pending|running|passed|failed|error|skipped` (existing CHECK — no schema changes needed this increment; do NOT touch `db/migrations/0025_builder.sql`).
- Check logs: capped and redacted via existing `capAndRedactLog(text, 200_000)` before upload via `putTextArtifact` to `ARTIFACT_KEYS.checkLog(checkKey)` under `artifactPrefix(orgId, proposalId, revisionId)`; `evidence_hash = sha256Hex(cappedLog)`.
- Worktree cleanup is guaranteed (try/finally): `git worktree remove --force` + `git worktree prune`, on success AND failure paths. Worktrees live under `os.tmpdir()`, named `builder-verify-<revisionId>`.
- Existing shell-out precedent to follow: `scripts/walkthrough/lib.ts` (`spawnLogged`) — Node built-in `child_process`, no execa.
- Test framework: Vitest 4 (`npx vitest run`), `// @vitest-environment node`, shared mock `lib/builder/__tests__/helpers/supabase-mock.ts`. Full suite and `npx tsc --noEmit` green at the end of every task (this increment is additive until Task 6 — no transient-red window).
- Heavy integration tests (`verify:migrations` against real Supabase, `verify:build` real Next build) are env-gated behind `BUILDER_VERIFY_HEAVY_TESTS=1` and are part of the human pre-merge checklist, like Increment 2's `BUILDER_DB_TESTS=1` suite.

## File Structure

| File | Responsibility |
|---|---|
| `lib/builder/check-matrix.ts` (new) | Check keys, per-check command specs (argv, timeout, version probe), change-class classifier `requiredCheckKeys`, unit-test target selection |
| `lib/builder/sandbox-env.ts` (new) | Pure env-allowlist builder `buildSandboxEnv` |
| `lib/builder/verification-runner.ts` (new) | `VerificationRunner` interface + `LocalWorktreeRunner` (worktree lifecycle, patch apply, authoritative diff, subprocess execution) |
| `lib/builder/verification.ts` (new) | Persistence glue: `runAndRecordVerification` — runs the runner, upserts `builder_verification_runs`, uploads logs, returns findings for patch failures |
| `lib/builder/proposal-state.ts` (modify) | Policy version bump to v2; delete `REQUIRED_CHECK_KEYS`; extend `VerificationRunRow` |
| `lib/builder/scaffold-worker.ts` (modify) | Compute required keys at attempt insert; verification step between path-policy block and model review |
| `lib/builder/artifacts.ts` (modify) | Add `ARTIFACT_KEYS.authoritativeDiff` |
| `package.json` (modify) | Five `verify:*` scripts |
| `scripts/verify/migrations-assert.sh` (new) | Post-reset sanity assertion for verify:migrations |
| `docs/BUILDER_OPERATIONS.md` (modify) | Verifier ops: host requirements, walkthrough-stack reset hazard, worktree hygiene, env scrubbing |

---

### Task 1: Check matrix, command table, and `verify:*` scripts

**Files:**
- Create: `lib/builder/check-matrix.ts`
- Modify: `package.json` (scripts section)
- Create: `scripts/verify/migrations-assert.sh`
- Test: `lib/builder/__tests__/check-matrix.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (later tasks rely on these exact names):

```ts
export const CHECK_KEYS = ['verify:types','verify:lint','verify:unit','verify:migrations','verify:build'] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

export interface CheckCommandSpec {
  key: CheckKey;
  /** argv[0] is the executable; run via spawn, never a shell string. */
  argv: (ctx: { changedFiles: string[] }) => string[];
  /** argv to obtain the tool version for command_version, e.g. ['npx','tsc','--version'] */
  versionArgv: string[];
  timeoutMs: number;
  /** env overrides merged on top of buildSandboxEnv output (e.g. NODE_ENV for build) */
  envOverrides?: Record<string, string>;
}
export const CHECK_COMMANDS: Record<CheckKey, CheckCommandSpec>;

/** Change-class matrix. types/lint/unit always; migrations iff db/migrations/**; build iff app|components|contexts|config. */
export function requiredCheckKeys(paths: string[]): CheckKey[];

/** Targeted vitest selection: source files -> `vitest related` inputs + always-on contract suites for changed routes/schema. */
export function unitTestTargets(paths: string[]): { relatedFiles: string[]; extraSuiteGlobs: string[] };

export function isLintablePath(path: string): boolean; // .ts/.tsx/.js/.jsx
```

Command table content (exact values):

| key | argv | timeoutMs | notes |
|---|---|---|---|
| `verify:types` | `['npx','tsc','--noEmit']` | 300000 | whole-project typecheck |
| `verify:lint` | `['npx','eslint', ...changedFiles.filter(isLintablePath)]` | 300000 | scoped lint; config files are path-policy-denied so scoped lint always suffices; if zero lintable files → argv returns `[]` and the runner records `passed` with log "no lintable files" |
| `verify:unit` | `['npx','vitest','run','related', ...relatedFiles, ...extraSuiteGlobs]` where `relatedFiles` = changed non-test source files and `extraSuiteGlobs` adds `app/api/__tests__/builder-schema-contract.test.ts` when `db/migrations/` touched and the matching `app/api/__tests__/*.test.ts` contract files when `app/api/` touched; if the selection is empty → run `['npx','vitest','run','lib/builder']` as the floor (Builder's own suites) | 600000 | deterministic: file list is sorted |
| `verify:migrations` | `['bash','-lc','npx supabase db reset && bash scripts/verify/migrations-assert.sh']` — the ONLY shell-string check, because it chains two commands; document why | 600000 | cwd = worktree; requires local stack; failure of either step = failed |
| `verify:build` | `['npx','next','build']` | 900000 | `envOverrides: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }` |

`requiredCheckKeys` predicate (exact):

```ts
const ALWAYS: CheckKey[] = ['verify:types', 'verify:lint', 'verify:unit'];
const MIGRATION_PREFIX = 'db/migrations/';
const BUILD_PREFIXES = ['app/', 'components/', 'contexts/'];
const BUILD_EXACT = ['middleware.ts', 'package.json'];
const BUILD_PATTERNS = [/^next\.config\.[a-z]+$/, /^tailwind\.config\.[a-z]+$/, /^postcss\.config\.[a-z]+$/, /^tsconfig(\..+)?\.json$/];
```

`scripts/verify/migrations-assert.sh` (complete):

```bash
#!/usr/bin/env bash
# Post-reset sanity: the canonical migrations produced a populated public schema
# on the local walkthrough stack (port 54322 per supabase/config.toml).
set -euo pipefail
DB_URL="${VERIFY_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
count=$(psql "$DB_URL" -Atc "select count(*) from pg_tables where schemaname='public'")
if [ "${count:-0}" -lt 10 ]; then
  echo "migrations-assert: expected >=10 public tables after reset, got ${count}" >&2
  exit 1
fi
echo "migrations-assert: ${count} public tables present"
```

package.json script additions (developer-facing mirrors):

```json
"verify:types": "tsc --noEmit",
"verify:lint": "eslint . --ext .js,.jsx,.ts,.tsx",
"verify:unit": "vitest run",
"verify:migrations": "supabase db reset && bash scripts/verify/migrations-assert.sh",
"verify:build": "next build"
```

(The dev-facing scripts run the unscoped variants; the runner's scoped argv comes from `CHECK_COMMANDS`. The contract test below pins the executable names so the two can't silently diverge.)

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/check-matrix.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run lib/builder/__tests__/check-matrix.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `lib/builder/check-matrix.ts`, the package.json scripts, and `scripts/verify/migrations-assert.sh` (`chmod +x`).
- [ ] **Step 4: Run to verify it passes** — same command → PASS. Also `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): change-class check matrix and verify scripts"`

---

### Task 2: Sandbox environment allowlist

**Files:**
- Create: `lib/builder/sandbox-env.ts`
- Test: `lib/builder/__tests__/sandbox-env.test.ts`

**Interfaces:**
- Produces:

```ts
/** Vars copied from the host env when present. Everything else is dropped. */
export const SANDBOX_ENV_ALLOWLIST = ['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','SHELL','USER','NODE_OPTIONS_SAFE_UNUSED'] as const;
/** Always-set values (placeholders are obviously fake; NEVER real secrets). */
export const SANDBOX_ENV_FIXED: Record<string, string> = {
  CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sandbox-placeholder-anon-key',
};
export const FORBIDDEN_ENV_VARS = ['SUPABASE_SERVICE_ROLE','SUPABASE_SERVICE_KEY','SUPABASE_ACCESS_TOKEN','ANTHROPIC_API_KEY','GITHUB_TOKEN','REDIS_URL','DATABASE_URL'] as const;
export function buildSandboxEnv(base: NodeJS.ProcessEnv, overrides?: Record<string, string>): Record<string, string>;
```

Semantics: start empty; copy allowlisted keys from `base` when defined; apply `SANDBOX_ENV_FIXED`; apply `overrides` last (per-check, e.g. `NODE_ENV=production` for build, `VERIFY_LOCAL_DB_URL` for migrations). Never copy anything else — allowlist, not denylist. `FORBIDDEN_ENV_VARS` exists purely for tests/audits to assert against.

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/sandbox-env.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildSandboxEnv, FORBIDDEN_ENV_VARS, SANDBOX_ENV_FIXED } from '@/lib/builder/sandbox-env';

const hostile: NodeJS.ProcessEnv = {
  PATH: '/usr/bin', HOME: '/Users/x', SUPABASE_SERVICE_ROLE: 'srv-secret',
  ANTHROPIC_API_KEY: 'sk-ant-123', GITHUB_TOKEN: 'ghp_abc', REDIS_URL: 'redis://prod',
  DATABASE_URL: 'postgres://prod', SUPABASE_ACCESS_TOKEN: 'sbp_x', SUPABASE_SERVICE_KEY: 'k',
  MY_CUSTOM_SECRET: 'x', AWS_SECRET_ACCESS_KEY: 'y', NPM_TOKEN: 'z',
};

describe('buildSandboxEnv', () => {
  const env = buildSandboxEnv(hostile);
  it('copies only allowlisted host vars', () => {
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/x');
  });
  it('excludes every forbidden var', () => {
    for (const key of FORBIDDEN_ENV_VARS) expect(env[key]).toBeUndefined();
  });
  it('excludes arbitrary non-allowlisted vars (allowlist, not denylist)', () => {
    expect(env.MY_CUSTOM_SECRET).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.NPM_TOKEN).toBeUndefined();
  });
  it('sets fixed placeholders', () => {
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(SANDBOX_ENV_FIXED.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(env.CI).toBe('1');
  });
  it('applies per-check overrides last', () => {
    expect(buildSandboxEnv(hostile, { NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });
  it('no value in the output equals a known secret value', () => {
    const values = Object.values(buildSandboxEnv(hostile));
    for (const secret of ['srv-secret','sk-ant-123','ghp_abc','redis://prod','postgres://prod']) {
      expect(values).not.toContain(secret);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run lib/builder/__tests__/sandbox-env.test.ts`
- [ ] **Step 3: Implement `lib/builder/sandbox-env.ts`.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): sandbox env allowlist for verification subprocesses"`

---

### Task 3: `VerificationRunner` interface + `LocalWorktreeRunner` (unit level)

**Files:**
- Create: `lib/builder/verification-runner.ts`
- Modify: `lib/builder/artifacts.ts` (add `authoritativeDiff: 'diff.authoritative.patch'` to `ARTIFACT_KEYS`; one-line)
- Test: `lib/builder/__tests__/verification-runner.test.ts`

**Interfaces:**
- Consumes: `CHECK_COMMANDS`, `CheckKey`, `unitTestTargets` (Task 1); `buildSandboxEnv` (Task 2); `evaluatePathPolicy`, `evaluateFileBudget`, `normalizeProposalPath` from `lib/builder/path-policy.ts` (existing).
- Produces:

```ts
export interface CheckExecution {
  key: CheckKey;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  exitCode: number | null;
  durationMs: number;
  commandVersion: string | null;   // from versionArgv, best-effort
  log: string;                     // raw, uncapped — persistence layer caps/redacts
  startedAt: string;               // ISO
  completedAt: string;             // ISO
}
export interface VerificationInput {
  baseSha: string | null;
  files: Array<{ path: string; content: string }>;
  requiredKeys: CheckKey[];
}
export interface VerificationOutcome {
  checks: CheckExecution[];
  /** null when patch/worktree setup succeeded */
  setupFailure: { stage: 'no_base_sha' | 'worktree' | 'path_policy' | 'file_budget' | 'patch'; detail: string } | null;
  authoritativeDiff: string | null; // unified diff from `git diff --cached`, null on setup failure
}
export interface VerificationRunner {
  run(input: VerificationInput): Promise<VerificationOutcome>;
}

/** Injectable process/git seams so unit tests never touch real git or spawn. */
export interface ProcessExecutor {
  exec(argv: string[], opts: { cwd: string; env: Record<string, string>; timeoutMs: number }): Promise<{ exitCode: number | null; output: string; timedOut: boolean }>;
}
export class LocalWorktreeRunner implements VerificationRunner {
  constructor(opts: { repoRoot: string; executor?: ProcessExecutor; tmpRoot?: string });
  run(input: VerificationInput): Promise<VerificationOutcome>;
}
export function defaultProcessExecutor(): ProcessExecutor; // child_process.spawn, kill-on-timeout (SIGKILL after grace), output capture capped at 5MB in-memory
```

`LocalWorktreeRunner.run` sequence (all git/tool calls go through `executor.exec`):
1. `baseSha` null → return `{ checks: requiredKeys.map(k => errored(k, 'no pinned base SHA available')), setupFailure: { stage: 'no_base_sha', ... }, authoritativeDiff: null }`. Each required check still gets a `CheckExecution` with `status:'error'` so evidence rows exist.
2. Verify SHA present: `git cat-file -e <sha>^{commit}`; on failure `git fetch origin <sha>` (host-side, host env — NOT sandbox env; this is the one permitted use of host credentials, read-only); still missing → setupFailure `worktree`.
3. `git worktree add --detach <tmpRoot>/builder-verify-<random> <sha>`; register cleanup in `finally`: `git worktree remove --force <dir>` then `git worktree prune`.
4. Symlink `<repoRoot>/node_modules` → `<worktree>/node_modules` (skip if base tracked a node_modules — it doesn't).
5. Re-check `evaluatePathPolicy(files.map(f => f.path))` and `evaluateFileBudget(files)` (defense in depth per audit: "again before sandbox patch application") → violation → setupFailure `path_policy`/`file_budget`, all required checks `skipped`.
6. Apply manifest: `mkdir -p` + write each file into the worktree (overwrite adds/edits; the manifest is full file contents, not hunks — "patch application failure" here means an unwritable path, which setupFailure `patch` captures).
7. `git -C <wt> add -A` then `git -C <wt> diff --cached` → `authoritativeDiff`.
8. For each required key IN ORDER (`CHECK_KEYS` order, filtered to required): resolve `spec = CHECK_COMMANDS[key]`; `argv = spec.argv({ changedFiles: files.map(f => normalizeProposalPath(f.path)).sort() })`; empty argv → `passed` with log `'no applicable files for this check'`; else best-effort `commandVersion` via `spec.versionArgv`; `executor.exec(argv, { cwd: worktree, env: buildSandboxEnv(process.env, spec.envOverrides), timeoutMs: spec.timeoutMs })`; map result: exit 0 → `passed`; nonzero → `failed`; `timedOut` → `failed` with `[timeout after Nms]` appended to log; executor throw → `error`. NO short-circuit — every required check produces a `CheckExecution`.

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/verification-runner.test.ts` with a `FakeExecutor` (scripted per-argv responses + full call log). Cases:
  - null baseSha → all required checks `error`, setupFailure `no_base_sha`, no executor calls;
  - happy path → executor calls in order: cat-file, worktree add, (symlink is fs — stub via tmpRoot fixture or capture), add -A, diff --cached, then per-check version+command calls with `cwd` = worktree dir and `env` lacking `GITHUB_TOKEN` (assert on captured env of every exec call);
  - fetch-on-missing-sha: cat-file fails once → fetch called → cat-file logic proceeds;
  - path-policy violation (e.g. `.github/workflows/x.yml` in files) → setupFailure `path_policy`, checks `skipped`, no check commands executed;
  - one check fails (exit 1) → later checks STILL run (no short-circuit), statuses `['passed','failed','passed']` shaped correctly;
  - timeout → status `failed`, log contains `timeout`;
  - cleanup: `worktree remove --force` + `prune` called on happy path AND when a check command throws (finally).
  Note in the test file that real-git behavior is covered by Task 4's integration suite — these tests pin orchestration logic only.
- [ ] **Step 2: Run → FAIL.** `npx vitest run lib/builder/__tests__/verification-runner.test.ts`
- [ ] **Step 3: Implement `verification-runner.ts` + the `ARTIFACT_KEYS.authoritativeDiff` addition.**
- [ ] **Step 4: Run → PASS**, plus `npx vitest run lib/builder/__tests__/artifacts.test.ts` (still green) and `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): local worktree verification runner"`

---

### Task 4: Runner integration tests (real git, real subprocesses)

**Files:**
- Test: `lib/builder/__tests__/verification-runner.integration.test.ts` (new; NOT env-gated — must run in plain CI, no Docker needed)

This is the audit's exit-criteria evidence at the runner level: real `git worktree`, real `node`/`tsc`/`eslint` subprocesses against a tiny fixture repo built in the test's tmpdir. No mocks for the executor.

- [ ] **Step 1: Write the fixture builder + tests.** In `beforeAll`, create a scratch git repo under `fs.mkdtempSync(path.join(os.tmpdir(), 'builder-verify-fixture-'))`: `git init`, config user, write a minimal `tsconfig.json` (`{"compilerOptions":{"strict":true,"noEmit":true},"include":["*.ts"]}`), a valid `ok.ts` (`export const n: number = 1;`), commit → capture `baseSha`. Tests (each constructs `LocalWorktreeRunner({ repoRoot: fixtureRepo, executor: defaultProcessExecutor(), tmpRoot })` — note `CHECK_COMMANDS` argv uses `npx tsc`, which resolves against the WORKER repo's node_modules via PATH; for the fixture, symlinking the real repo's node_modules into the worktree per runner step 4 makes `npx tsc` resolve — assert this works, it is exactly the production mechanism):
  1. **Env scrubbing is real:** run with `requiredKeys: []`... instead add a test-only injected spec — simpler: set `process.env.GITHUB_TOKEN='fixture-secret'` (restore after) and run a check whose command is overridden via a `FakeSpecExecutor`? NO — this test must use the REAL executor. Approach: temporarily monkeypatch `CHECK_COMMANDS['verify:lint']` is not allowed (const). Instead the runner test calls `defaultProcessExecutor().exec(['node','-e','process.exit(process.env.GITHUB_TOKEN ? 7 : 0)'], { cwd: tmp, env: buildSandboxEnv(process.env), timeoutMs: 10000 })` directly with `GITHUB_TOKEN` set in `process.env` → expect `exitCode 0`. Also assert `env` object handed to exec lacks the var (belt and suspenders).
  2. **Deliberately broken type blocks:** apply `{ path: 'broken.ts', content: 'export const n: number = "not a number";\n' }` with `requiredKeys: ['verify:types']` → `checks[0].status === 'failed'`, `exitCode !== 0`, log contains `TS2322` (reproducible evidence). Timeout for this test: 120s vitest timeout (tsc on the tiny fixture is seconds, but first npx resolution can be slow).
  3. **Valid type passes:** apply a well-typed file → `passed`.
  4. **Deliberately broken lint blocks:** fixture needs an eslint config — write `.eslintrc.json` `{"rules":{"no-debugger":"error"}}` in the fixture repo commit; apply `{ path: 'bad.ts', content: 'debugger;\n' }`, `requiredKeys: ['verify:lint']` → `failed`, log contains `no-debugger`.
  5. **Worktree cleanup on success and on failure:** after each run, `git -C fixtureRepo worktree list` contains only the main checkout; force a failure (broken.ts case) and assert the same.
  6. **Authoritative diff:** returned diff contains `+export const n` for the applied file; `sha256Hex(diff)` is stable across two identical runs (determinism).
  7. **Timeout kill:** a spec can't be injected into CHECK_COMMANDS, so test `defaultProcessExecutor` directly: `exec(['node','-e','setTimeout(()=>{}, 60000)'], { timeoutMs: 1500, ... })` → resolves with `timedOut: true` in < 10s (process actually killed).
- [ ] **Step 2: Run** — `npx vitest run lib/builder/__tests__/verification-runner.integration.test.ts` → all PASS (this is test-first only in spirit; the runner exists from Task 3 — failures here are real bugs to fix in the runner, fix them now).
- [ ] **Step 3: Full suite + tsc** — `npx vitest run && npx tsc --noEmit` → green.
- [ ] **Step 4: Commit** — `git commit -m "test(builder): real-git integration coverage for the verification runner"`

---

### Task 5: Persistence glue — `runAndRecordVerification`

**Files:**
- Create: `lib/builder/verification.ts`
- Modify: `lib/builder/proposal-state.ts` (extend `VerificationRunRow` ONLY — policy bump happens in Task 6):

```ts
export interface VerificationRunRow {
  id: string;
  review_attempt_id: string;
  check_key: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';
  exit_code: number | null;
  duration_ms: number | null;
  log_artifact_key: string | null;
  evidence_hash: string | null;
  command_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
```

- Test: `lib/builder/__tests__/verification.test.ts`

**Interfaces:**
- Consumes: `VerificationRunner`, `VerificationOutcome`, `CheckExecution` (Task 3); `capAndRedactLog`, `sha256Hex`, `putTextArtifact`, `artifactPrefix`, `ARTIFACT_KEYS` (existing + Task 3); shared supabase mock for tests.
- Produces:

```ts
export interface VerificationRecordResult {
  /** findings to insert when setup failed (reviewer_kind 'deterministic_check', severity 'blocker', state 'open') */
  setupFindings: Array<{ reviewer_kind: 'deterministic_check'; severity: 'blocker'; category: 'verification'; evidence: string; state: 'open' }>;
  allRequiredPassed: boolean;
}
export async function runAndRecordVerification(admin: SupabaseClient, args: {
  orgId: string; proposalId: string; revisionId: string; attemptId: string;
  files: Array<{ path: string; content: string }>;
  baseSha: string | null;
  requiredKeys: CheckKey[];
  runner: VerificationRunner;
}): Promise<VerificationRecordResult>;
```

Behavior:
1. `runner.run({ baseSha, files, requiredKeys })`.
2. For every `CheckExecution`: `cappedLog = capAndRedactLog(exec.log, 200_000)`; upload via `putTextArtifact(admin, `${artifactPrefix(orgId,proposalId,revisionId)}/${ARTIFACT_KEYS.checkLog(exec.key)}`, cappedLog)` — upload failures are caught and downgrade the row to `log_artifact_key: null` (the run row is still written; verification evidence must not be lost to a storage hiccup, and the status is NOT changed by a log-upload failure); UPSERT into `builder_verification_runs` with `onConflict: 'review_attempt_id,check_key'`: `{ review_attempt_id: attemptId, check_key, status, exit_code, duration_ms, command_version, log_artifact_key, evidence_hash: sha256Hex(cappedLog), started_at, completed_at }`.
3. If `outcome.authoritativeDiff` non-null: `putTextArtifact(..., ARTIFACT_KEYS.authoritativeDiff, authoritativeDiff)` (catch/log on failure — non-fatal).
4. If `outcome.setupFailure` non-null: return one blocker finding: `evidence: capAndRedactLog(`verification setup failed at ${stage}: ${detail}`, 10_000)`.
5. `allRequiredPassed = requiredKeys.every(k => outcome.checks.find(c => c.key === k)?.status === 'passed')` (informational — the gate remains the authority).

- [ ] **Step 1: Write the failing test** using `SupabaseMock` + a stub runner. Cases: happy path (upsert called once per key with `onConflict: 'review_attempt_id,check_key'`, exact row payloads, evidence_hash = sha256Hex of the CAPPED log, artifact keys `checks/verify:types.log` under the right prefix); log-upload failure → row still upserted with `log_artifact_key: null`, status unchanged; setupFailure → skipped/errored rows written AND one blocker finding returned with `reviewer_kind:'deterministic_check'`; authoritative diff uploaded when present; redaction proven (stub log contains `Bearer abc123` → uploaded body contains `[redacted]`); idempotency (same attempt re-run → upsert again, never plain insert).
- [ ] **Step 2: Run → FAIL.** `npx vitest run lib/builder/__tests__/verification.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): verification persistence with capped, redacted evidence"`

---

### Task 6: Worker wiring + policy v2

**Files:**
- Modify: `lib/builder/proposal-state.ts`: `REVIEW_POLICY_VERSION = 'builder-review-policy/v2'`; DELETE `REQUIRED_CHECK_KEYS` entirely.
- Modify: `lib/builder/scaffold-worker.ts`:
  - Step 4 (attempt insert, ~lines 215-241): `required_check_keys: requiredCheckKeys(files.map(f => f.path))` (import from check-matrix) instead of the deleted constant; keep everything else identical.
  - New Step 5.5, AFTER the existing path-policy/file-budget block (Step 5, ~line 275) and BEFORE `runModelReview` (Step 6, ~line 277):

```ts
// Step 5.5: deterministic verification (audit Phase 2 — before any AI review)
const verification = await runAndRecordVerification(admin, {
  orgId, proposalId, revisionId, attemptId,
  files, baseSha: revision.base_commit_sha,
  requiredKeys: attemptRequiredKeys,           // same array inserted on the attempt
  runner: createVerificationRunner(),
});
if (verification.setupFindings.length > 0) {
  await admin.from('builder_review_findings').insert(
    verification.setupFindings.map(f => ({ ...f, review_attempt_id: attemptId }))
  );
}
// Do NOT branch on verification results here — Step 6 (model review) still runs,
// and Step 7's evaluateAttemptGate is the sole authority on pass/blocked.
```

  - `createVerificationRunner()`: a tiny factory in `verification-runner.ts` — `new LocalWorktreeRunner({ repoRoot: process.cwd() })` — the seam where Increment 3b later selects a container runner from config.
  - Step 7 needs NO logic change (it already loads runs), but its `attemptForGate` construction (~line 335) must use the per-attempt `required_check_keys` (it already reads the attempt row's value or the same local array — verify and align).
- Modify (test updates, same commit): `lib/builder/__tests__/scaffold-worker.test.ts` (stub `runAndRecordVerification` via `vi.mock`; assert it runs after attempt insert and before model review via call-log order; assert `required_check_keys` on the attempt insert reflects the classifier — e.g. a manifest with a migration file yields keys including `verify:migrations`; assert a failing required check leads Step 7's gate to `needs_repair` with attempt `blocked` and decision_reason `'Required verification checks have not passed.'`; assert setup-failure findings are inserted with `reviewer_kind:'deterministic_check'`); `lib/builder/__tests__/review-gate.test.ts` and `app/api/__tests__/builder-apply-gate.test.ts` (any fixture using `policy_version: 'builder-review-policy/v1'` literal or importing `REQUIRED_CHECK_KEYS` — update to `REVIEW_POLICY_VERSION` import/v2; grep first: `grep -rn "builder-review-policy/v1\|REQUIRED_CHECK_KEYS" app/ lib/ components/`); `lib/builder/__tests__/scaffold-endpoints.test.ts` if it references the constant.

**Interfaces:**
- Consumes: `requiredCheckKeys` (Task 1), `runAndRecordVerification` (Task 5), `createVerificationRunner` (this task).
- Produces: the live pipeline — this is the task after which a real worker run performs verification.

- [ ] **Step 1: Update tests first** (worker sequence, classifier-derived keys, v2 literals). Run → FAIL. `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
- [ ] **Step 2: Implement** the worker changes, the policy bump, constant deletion, and `createVerificationRunner`.
- [ ] **Step 3: Run** targeted suites → PASS: `npx vitest run lib/builder/__tests__/ app/api/__tests__/`
- [ ] **Step 4: Full suite + tsc** → green: `npx vitest run && npx tsc --noEmit`
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): worker runs deterministic verification under review policy v2"`

---

### Task 7: Docs, source hygiene, and pre-merge checklist

**Files:**
- Modify: `docs/BUILDER_OPERATIONS.md`
- Modify: `app/api/__tests__/builder-schema-contract.test.ts` (extend the source-guard `it()` to also ban `REQUIRED_CHECK_KEYS` and `builder-review-policy/v1` in live code)
- Test: full-suite + heavy-gated runs

- [ ] **Step 1: Extend the source guard** (Task-11-of-Increment-2 pattern — add the two banned tokens to the existing walk's token list) and run it: `npx vitest run app/api/__tests__/builder-schema-contract.test.ts` → PASS (fix stragglers if it finds any).
- [ ] **Step 2: Update `docs/BUILDER_OPERATIONS.md`** with a "Deterministic verification" section: the five check keys + when each is required (the matrix table verbatim); worker host requirements (git binary, repo checkout with fetchable origin, node_modules installed; OPTIONAL local Supabase stack — without it, migration-touching proposals fail verification by design); the walkthrough-stack reset hazard (`verify:migrations` DESTROYS local walkthrough data — it is the same stack as `walkthrough:*`); worktree hygiene (`builder-verify-*` dirs under tmp; per-run cleanup is automatic; manual recovery: `git worktree prune`); env scrubbing statement (check subprocesses receive an allowlisted env — never service-role keys, AI keys, GitHub tokens, or Redis URLs; placeholder NEXT_PUBLIC values are fake); policy v2 note (all v1 attempts are stale; every proposal needs a fresh run after deploy); Increment 3b pointer (container runner is the production-hardening follow-up; local runner still executes proposal-influenced code on the worker host — do not point a production worker at this until 3b).
- [ ] **Step 3: Heavy env-gated verification (best-effort in this environment):** `BUILDER_VERIFY_HEAVY_TESTS=1` currently gates nothing in-repo (heavy behavior = real `verify:migrations`/`verify:build` runs); instead run the commands directly if the environment allows: `npm run verify:types && npm run verify:lint` (should pass on the branch itself — dogfooding); attempt `npm run verify:build` (report result; a pass is a nice signal, a failure due to missing env is acceptable — note it); attempt `npm run verify:migrations` ONLY if Docker/local Supabase is available, else record "not run — no local stack" in the report.
- [ ] **Step 4: Full verification** — `npx vitest run && npx tsc --noEmit` → green.
- [ ] **Step 5: Commit** — `git commit -m "docs(builder): verifier operations, matrix, and policy v2 rollout notes"`
- [ ] **Step 6: PR body must call out:** every proposal needs a fresh review run under policy v2 (v1 attempts are stale by design); worker restart required; `verify:migrations` resets the local walkthrough DB; the container runner (Increment 3b) is required before production rollout — the local runner executes checks on the worker host; and the human pre-merge checklist below.

## Human pre-merge checklist (cannot be fully verified in a sandboxed session)

1. `npm run verify:types && npm run verify:lint && npm run verify:unit` on the branch — all pass.
2. With Docker + local Supabase running: `npm run verify:migrations` — resets and asserts cleanly.
3. `npm run verify:build` — production build passes.
4. Live worker walkthrough: create a generic proposal touching one `lib/` file with a deliberate type error → claim → worker run → confirm `builder_verification_runs` rows exist for types/lint/unit with `verify:types` `failed` and a `checks/verify:types.log` artifact containing the TS error → proposal lands in `needs_repair` with decision reason `'Required verification checks have not passed.'` → fix the type error via a new submission → verify it reaches `ready_to_apply`.
5. Confirm no `builder-verify-*` worktrees remain after runs (`git worktree list`).

## Sequencing risks

1. **No transient-red window this increment** — Tasks 1-5 are additive; Task 6 is the only cutover commit and is self-contained (constant deletion + policy bump + wiring land together).
2. **Policy v2 invalidates all existing attempts** the moment Task 6 deploys — intended (audit: policy changes require reruns), but every in-flight `ready_to_apply` proposal reverts to needing a fresh run. Call out in PR.
3. **The worker host must have git + a fetchable origin.** A worker deployed from a tarball (no `.git`) cannot verify anything — every check errors, gate blocks. Documented in ops; acceptable fail-closed behavior.
4. **`vitest related` behavior** should be confirmed against Vitest 4 during Task 1 (the command exists in v4; if its selection proves unreliable for some path shapes, the fallback floor `vitest run lib/builder` plus extra suites keeps the check deterministic — the implementer should verify with a quick local invocation and note findings).
5. **`npx` resolution inside the worktree** depends on the node_modules symlink (Task 3 step 4) — Task 4's integration tests exercise exactly this mechanism against the real repo's node_modules.
6. **Increment 3b (container runner) is a hard prerequisite for production rollout** — the local runner executes `tsc`/`eslint`/`vitest`/`next build` over proposal-modified code on the worker host. Env scrubbing removes secret exposure, but arbitrary code execution on the host remains (e.g. a proposal adding a malicious test). Path policy limits blast radius (no package.json/lockfile/config changes), but the audit's container isolation is the real answer. The ops doc and PR body must state this plainly.

## Verification (end-to-end)

- `npx tsc --noEmit` clean; `npx vitest run` fully green (includes the new check-matrix, sandbox-env, runner unit, runner INTEGRATION [real git/tsc/eslint], verification-persistence, and updated worker suites).
- Runner integration tests prove the audit's exit criteria at the unit-of-execution level: a deliberately broken type and a deliberately broken lint rule each produce a `failed` check with reproducible log evidence; env scrubbing proven by a real subprocess unable to read `GITHUB_TOKEN`; worktree cleanup proven on success and failure.
- Human checklist above covers the pieces requiring Docker/live DB/real worker (migrations, build, full pipeline walkthrough) — same convention as Increment 2's live-DB gap.
