# Builder Phase 0 Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every path by which an unreviewed Builder code proposal can reach GitHub — Increment 1 (Phase 0) of `docs/BUILDER_REVIEW_ORCHESTRATION_AUDIT.md`.

**Architecture:** Two new pure policy modules (`lib/builder/path-policy.ts`, `lib/builder/review-gate.ts`) become the single decision points for "may this proposal's files be written" and "did automated review pass". They are enforced at every seam: tool-input validation, the scaffold worker, the build-start route (which also gains an atomic compare-and-set claim), and the GitHub apply route. The manual ship assertion is retired; the lifecycle model gains honest `needs_repair` / `ready_to_apply` / `run_failed` states.

**Tech Stack:** Next.js 15 App Router routes, Supabase (PostgREST via `@supabase/supabase-js`), BullMQ worker, Vitest (behavioral route tests mock `@/lib/supabase` at the module boundary — the pattern in `app/api/__tests__/grants-transition.test.ts`).

## Global Constraints

- This is a prerelease database: no compatibility shims; no data-migration concerns for phase renames. **No schema changes in this plan** — the `phase` column is unconstrained TEXT (migration `0026_builder_enhancement.sql`); new phase values need no migration. The durable schema (revisions/attempts/findings tables) is Increment 2.
- The working tree carries uncommitted work ("self-service workbench" sweep). **Preflight Task 1 checkpoints it** so this plan's commits are clean.
- A model score is never an authorization signal (audit "best in class" rule 4). The review gate keys only on blocking findings and report integrity.
- Route auth canon: implementation-reviewer actions use `canReviewImplementation` from `lib/org-capabilities.ts`; org-admin reads use `is_org_admin` RPC. `is_org_member` does not exist anywhere.
- Canonical phases after this plan: `pending | plan_ready | queued | building | build_ready | reviewing | needs_repair | ready_to_apply | failed | pr_opened`. `applied` and `shipped` are retired for code proposals.
- New behavioral route tests need `// @vitest-environment node` (vitest default is jsdom).
- Test commands: `npx vitest run <path>`; typecheck: `npx tsc --noEmit`; lint: `npx eslint <files>`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Preflight — checkpoint uncommitted workbench state

**Files:** none created; commits the existing dirty tree as-is.

- [ ] **Step 1: Checkpoint commit**

```bash
git add -A
git commit -m "checkpoint: uncommitted self-service workbench state before builder phase-0 gate work

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Verify clean tree**

Run: `git status --short`
Expected: empty output.

---

### Task 2: Path policy module

**Files:**
- Create: `lib/builder/path-policy.ts`
- Test: `lib/builder/__tests__/path-policy.test.ts`

**Interfaces:**
- Produces: `evaluatePathPolicy(paths: string[]): PathPolicyResult` where `PathPolicyResult = { allowed: boolean; violations: Array<{ path: string; rule: string; detail: string }> }`; `formatPathPolicyViolations(violations): string`; `evaluateFileBudget(files: Array<{ content: string }>): string | null`; `PROPOSAL_FILE_BUDGET = { maxFiles: 50, maxTotalContentBytes: 1_500_000 }`; `normalizeProposalPath(path: string): string`.
- Consumed by Tasks 5 (tools.ts), 6 (worker), 8 (apply route).

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/path-policy.test.ts`:

```ts
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

  it('denies rewriting an existing migration', () => {
    // 0001 exists on disk in this repo.
    expect(rules(['db/migrations/0001_extensions_and_shared_infra.sql'])).toContain('migration-rewrite');
  });

  it('denies non-canonical names under db/migrations/', () => {
    expect(rules(['db/migrations/notes.md'])).toContain('migration-rewrite');
    expect(rules(['db/migrations/patch.sql'])).toContain('migration-rewrite');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/path-policy.test.ts`
Expected: FAIL — cannot resolve `@/lib/builder/path-policy`.

- [ ] **Step 3: Write the implementation** — `lib/builder/path-policy.ts`:

```ts
// lib/builder/path-policy.ts
//
// Default-deny path policy for Builder code proposals (audit Phase 0, item 4).
// Enforced at three seams: tool-input validation (lib/builder/tools.ts),
// worker output validation (lib/builder/scaffold-worker.ts), and the GitHub
// apply route. Elevated exceptions are a later-phase feature; today every
// violation blocks the proposal.

import { existsSync } from 'fs';

export interface PathPolicyViolation {
  path: string;
  rule: string;
  detail: string;
}

export interface PathPolicyResult {
  allowed: boolean;
  violations: PathPolicyViolation[];
}

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
]);

const DEPLOYMENT_FILE_NAMES = new Set([
  'vercel.json',
  'netlify.toml',
  'fly.toml',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

const PROTECTED_EXACT_PATHS = new Set([
  'package.json',
  'tsconfig.json',
  'middleware.ts',
  'app/middleware.ts',
  'lib/supabase.ts',
  'lib/org-capabilities.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vitest.config.ts',
  'vitest.setup.ts',
]);

const PROTECTED_PREFIXES = [
  '.github/',
  '.git/',
  'scripts/',
  'supabase/',
  'db/legacy/',
  'lib/auth/',
];

const NEW_MIGRATION_PATTERN = /^db\/migrations\/\d{4}_[a-z0-9_]+\.sql$/;

export const PROPOSAL_FILE_BUDGET = {
  maxFiles: 50,
  maxTotalContentBytes: 1_500_000,
} as const;

export function normalizeProposalPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

function migrationDetail(path: string): string | null {
  if (!path.startsWith('db/migrations/')) return null;
  if (!NEW_MIGRATION_PATTERN.test(path)) {
    return 'Only new NNNN_name.sql migration files may be proposed under db/migrations/.';
  }
  try {
    if (existsSync(path)) {
      return 'Rewriting an existing migration is not allowed; add a new migration instead.';
    }
  } catch {
    // Filesystem unavailable in this runtime — the same check runs again at apply time.
  }
  return null;
}

export function evaluatePathPolicy(paths: string[]): PathPolicyResult {
  const violations: PathPolicyViolation[] = [];
  const seen = new Set<string>();

  for (const raw of paths) {
    const path = normalizeProposalPath(raw);
    const lower = path.toLowerCase();
    const basename = lower.split('/').pop() ?? '';

    if (seen.has(lower)) {
      violations.push({ path: raw, rule: 'duplicate-path', detail: 'The same file appears more than once in this proposal.' });
      continue;
    }
    seen.add(lower);

    const prefix = PROTECTED_PREFIXES.find(p => lower.startsWith(p));
    if (prefix) {
      violations.push({ path: raw, rule: 'protected-directory', detail: `Files under ${prefix} cannot be proposed.` });
    }
    if (path.split('/').some(segment => segment.startsWith('.env'))) {
      violations.push({ path: raw, rule: 'env-file', detail: 'Environment and secret files cannot be proposed.' });
    }
    if (LOCKFILE_NAMES.has(basename)) {
      violations.push({ path: raw, rule: 'lockfile', detail: 'Dependency lockfiles cannot be proposed.' });
    }
    if (DEPLOYMENT_FILE_NAMES.has(basename)) {
      violations.push({ path: raw, rule: 'deployment-config', detail: 'Deployment configuration cannot be proposed.' });
    }
    if (PROTECTED_EXACT_PATHS.has(lower)) {
      violations.push({ path: raw, rule: 'protected-file', detail: 'Security- and build-critical files cannot be proposed.' });
    }
    const migration = migrationDetail(path);
    if (migration) {
      violations.push({ path: raw, rule: 'migration-rewrite', detail: migration });
    }
  }

  return { allowed: violations.length === 0, violations };
}

export function formatPathPolicyViolations(violations: PathPolicyViolation[]): string {
  return violations.map(v => `${v.path}: ${v.detail}`).join(' ');
}

export function evaluateFileBudget(files: Array<{ content: string }>): string | null {
  if (files.length > PROPOSAL_FILE_BUDGET.maxFiles) {
    return `Proposals are limited to ${PROPOSAL_FILE_BUDGET.maxFiles} files.`;
  }
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
  if (totalBytes > PROPOSAL_FILE_BUDGET.maxTotalContentBytes) {
    return `Proposal content exceeds the ${PROPOSAL_FILE_BUDGET.maxTotalContentBytes.toLocaleString()}-byte budget.`;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/builder/__tests__/path-policy.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/builder/path-policy.ts lib/builder/__tests__/path-policy.test.ts
git commit -m "feat(builder): add default-deny path policy for code proposals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Review gate module

**Files:**
- Create: `lib/builder/review-gate.ts`
- Test: `lib/builder/__tests__/review-gate.test.ts`

**Interfaces:**
- Produces: `parseReviewReport(value: unknown): ReviewReport | null` and `evaluateReviewGate(value: unknown): ReviewGateResult` where `ReviewReport = { score: number; findings: Array<{ severity: string; description: string }> }` and `ReviewGateResult = { pass: boolean; blockers: string[]; reason: string | null }`. Blocking severities: `error`, `blocker`, `critical` (case-insensitive). Score is deliberately ignored by the gate.
- Consumed by Tasks 6 (worker) and 8 (apply route).

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/review-gate.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evaluateReviewGate, parseReviewReport } from '@/lib/builder/review-gate';

describe('parseReviewReport', () => {
  it('accepts a well-formed report', () => {
    const report = parseReviewReport({ score: 80, findings: [{ severity: 'warning', description: 'Add empty state.' }] });
    expect(report).toEqual({ score: 80, findings: [{ severity: 'warning', description: 'Add empty state.' }] });
  });

  it('rejects null, arrays, missing findings, and malformed findings', () => {
    expect(parseReviewReport(null)).toBeNull();
    expect(parseReviewReport([])).toBeNull();
    expect(parseReviewReport({ score: 80 })).toBeNull();
    expect(parseReviewReport({ score: 'high', findings: [] })).toBeNull();
    expect(parseReviewReport({ score: 80, findings: [{ severity: 'error' }] })).toBeNull();
  });
});

describe('evaluateReviewGate', () => {
  it('passes a report with only warnings', () => {
    const result = evaluateReviewGate({ score: 70, findings: [{ severity: 'warning', description: 'Nit.' }] });
    expect(result.pass).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('passes an empty findings list regardless of score — score is never an authorization signal', () => {
    expect(evaluateReviewGate({ score: 0, findings: [] }).pass).toBe(true);
  });

  it('blocks error findings regardless of a high score', () => {
    const result = evaluateReviewGate({
      score: 98,
      findings: [{ severity: 'error', description: 'Missing RLS policy on new table.' }],
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(['Missing RLS policy on new table.']);
  });

  it('treats blocker and critical severities as blocking, case-insensitively', () => {
    expect(evaluateReviewGate({ score: 90, findings: [{ severity: 'Blocker', description: 'x' }] }).pass).toBe(false);
    expect(evaluateReviewGate({ score: 90, findings: [{ severity: 'CRITICAL', description: 'y' }] }).pass).toBe(false);
  });

  it('fails closed when the report is missing or malformed', () => {
    const missing = evaluateReviewGate(null);
    expect(missing.pass).toBe(false);
    expect(missing.reason).toMatch(/review report/i);
    expect(evaluateReviewGate({ score: 50 }).pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/review-gate.test.ts`
Expected: FAIL — cannot resolve `@/lib/builder/review-gate`.

- [ ] **Step 3: Write the implementation** — `lib/builder/review-gate.ts`:

```ts
// lib/builder/review-gate.ts
//
// Decides whether a stored automated review report makes a proposal
// PR-eligible. Only blocking findings and report integrity matter — a numeric
// score is never an authorization signal (audit Phase 0, item 2). Fails
// closed: a missing or malformed report never passes.

export interface ReviewFinding {
  severity: string;
  description: string;
}

export interface ReviewReport {
  score: number;
  findings: ReviewFinding[];
}

export interface ReviewGateResult {
  pass: boolean;
  blockers: string[];
  reason: string | null;
}

const BLOCKING_SEVERITIES = new Set(['error', 'blocker', 'critical']);

export function parseReviewReport(value: unknown): ReviewReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.score !== 'number' || !Number.isFinite(record.score)) return null;
  if (!Array.isArray(record.findings)) return null;

  const findings: ReviewFinding[] = [];
  for (const item of record.findings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const finding = item as Record<string, unknown>;
    if (typeof finding.severity !== 'string' || typeof finding.description !== 'string') return null;
    findings.push({ severity: finding.severity, description: finding.description });
  }
  return { score: record.score, findings };
}

export function evaluateReviewGate(value: unknown): ReviewGateResult {
  const report = parseReviewReport(value);
  if (!report) {
    return { pass: false, blockers: [], reason: 'No valid automated review report exists for this proposal.' };
  }
  const blockers = report.findings
    .filter(finding => BLOCKING_SEVERITIES.has(finding.severity.toLowerCase()))
    .map(finding => finding.description);
  if (blockers.length > 0) {
    return { pass: false, blockers, reason: 'Automated review reported blocking findings.' };
  }
  return { pass: true, blockers: [], reason: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/builder/__tests__/review-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/builder/review-gate.ts lib/builder/__tests__/review-gate.test.ts
git commit -m "feat(builder): add fail-closed review gate for code proposals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Honest lifecycle model (retire `shipped`, add repair/failed/ready states)

**Files:**
- Modify: `lib/builder/proposal-lifecycle.ts` (full rewrite below)
- Test: `lib/builder/__tests__/proposal-lifecycle.test.ts` (full rewrite below)

**Interfaces:**
- Produces: `PROPOSAL_LIFECYCLE_STATUSES` = `['drafted','awaiting_approval','applied','needs_implementation_review','in_review','needs_repair','ready_to_apply','run_failed','pr_opened','rejected']`; same three exported functions with unchanged signatures. Task 9's UI depends on this exact status list.

- [ ] **Step 1: Rewrite the test** — replace `lib/builder/__tests__/proposal-lifecycle.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';
import { getProposalLifecycle, PROPOSAL_LIFECYCLE_STATUSES, proposalLifecycleNextStep } from '@/lib/builder/proposal-lifecycle';

describe('Builder proposal lifecycle', () => {
  it('maps the implementation review path with honest gate states', () => {
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'plan_ready' })).toBe('needs_implementation_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'queued' })).toBe('in_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'reviewing' })).toBe('in_review');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'needs_repair' })).toBe('needs_repair');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'ready_to_apply' })).toBe('ready_to_apply');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'pending', phase: 'failed' })).toBe('run_failed');
    expect(getProposalLifecycle({ proposalType: 'code', status: 'approved', phase: 'pr_opened', prUrl: 'https://example.com/pr/1' })).toBe('pr_opened');
  });

  it('never reports a delivery state — shipped is retired', () => {
    expect(PROPOSAL_LIFECYCLE_STATUSES).not.toContain('shipped');
    // A stray legacy row with phase=shipped still has an open-PR truth.
    expect(getProposalLifecycle({ proposalType: 'code', status: 'applied', phase: 'shipped', prUrl: 'https://example.com/pr/1' })).toBe('pr_opened');
  });

  it('keeps safe configuration changes separate from implementation proposals', () => {
    expect(getProposalLifecycle({ proposalType: 'config', status: 'pending' })).toBe('awaiting_approval');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'applied' })).toBe('applied');
    expect(getProposalLifecycle({ proposalType: 'config', status: 'rejected' })).toBe('rejected');
  });

  it('has next-step copy for every status and never promises deployment from an open PR', () => {
    for (const status of PROPOSAL_LIFECYCLE_STATUSES) {
      expect(proposalLifecycleNextStep(status).length).toBeGreaterThan(0);
    }
    expect(proposalLifecycleNextStep('pr_opened').toLowerCase()).not.toContain('shipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/proposal-lifecycle.test.ts`
Expected: FAIL — `needs_repair` maps to `in_review`? No: currently unknown phases fall through to `drafted`; `shipped` still in statuses.

- [ ] **Step 3: Rewrite the implementation** — replace `lib/builder/proposal-lifecycle.ts` entirely:

```ts
export const PROPOSAL_LIFECYCLE_STATUSES = [
  'drafted',
  'awaiting_approval',
  'applied',
  'needs_implementation_review',
  'in_review',
  'needs_repair',
  'ready_to_apply',
  'run_failed',
  'pr_opened',
  'rejected',
] as const;

export type ProposalLifecycleStatus = typeof PROPOSAL_LIFECYCLE_STATUSES[number];

export interface ProposalLifecycleInput {
  proposalType: 'config' | 'code';
  status: string;
  phase?: string | null;
  prUrl?: string | null;
}

export function getProposalLifecycle(input: ProposalLifecycleInput): ProposalLifecycleStatus {
  if (input.status === 'rejected') return 'rejected';
  // `shipped` is retired: an open PR is the last state Builder can attest to
  // until verified merge/deployment records exist (audit Phase 6).
  if (input.phase === 'pr_opened' || input.phase === 'shipped' || input.prUrl) return 'pr_opened';
  if (input.proposalType === 'config') {
    if (input.status === 'applied') return 'applied';
    return 'awaiting_approval';
  }
  if (input.phase === 'plan_ready') return 'needs_implementation_review';
  if (input.phase === 'needs_repair') return 'needs_repair';
  if (input.phase === 'ready_to_apply') return 'ready_to_apply';
  if (input.phase === 'failed') return 'run_failed';
  if (['queued', 'building', 'build_ready', 'reviewing', 'implementation_review'].includes(input.phase || '')) {
    return 'in_review';
  }
  return 'drafted';
}

export function proposalLifecycleLabel(status: ProposalLifecycleStatus): string {
  return status.replace(/_/g, ' ');
}

export function proposalLifecycleNextStep(status: ProposalLifecycleStatus): string {
  const steps: Record<ProposalLifecycleStatus, string> = {
    drafted: 'Builder is preparing the change request.',
    awaiting_approval: 'An organization admin can approve this safe configuration change.',
    applied: 'The configuration has been applied to this workspace.',
    needs_implementation_review: 'An implementation reviewer must start the automated build and review run.',
    in_review: 'Implementation is being generated and reviewed before a PR can open.',
    needs_repair: 'Automated review found blocking issues. A reviewer can retry the run or decline the proposal.',
    ready_to_apply: 'Automated review passed. An implementation reviewer can open a pull request.',
    run_failed: 'The last run failed before producing a review. A reviewer can retry the run.',
    pr_opened: 'A pull request is open. Merge and deployment happen through the normal engineering release process.',
    rejected: 'This request was declined. Builder can help draft an alternative.',
  };
  return steps[status];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/builder/__tests__/proposal-lifecycle.test.ts`
Expected: PASS.

Note: `components/builder-studio/StudioProposalsPanel.tsx` will now fail typecheck (its `STATUS_CLASS` record misses new statuses / has `shipped`). That is fixed in Task 9 — do **not** run `tsc --noEmit` as a task gate until then.

- [ ] **Step 5: Commit**

```bash
git add lib/builder/proposal-lifecycle.ts lib/builder/__tests__/proposal-lifecycle.test.ts
git commit -m "feat(builder): honest lifecycle states; retire shipped delivery claim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Close the generic-proposal bypass and validate model plans (tools.ts)

**Files:**
- Modify: `lib/builder/tools.ts` (targeted edits below)
- Test: existing `lib/builder/__tests__/scaffold-module-tool.test.ts`, `lib/builder/__tests__/module-tools.test.ts` (run; update only if they assert old behavior)

**Interfaces:**
- Consumes: `evaluatePathPolicy`, `evaluateFileBudget`, `formatPathPolicyViolations` from Task 2.
- Produces: `submit_code_proposal` inserts `phase: 'plan_ready'` (never `ready_to_apply`); `validateProposalFiles` enforces budget + path policy; new `validateScaffoldPlanContent(value: unknown): ScaffoldPlanContent` validates the model-produced plan; `PROPOSAL_PHASES` becomes the canonical list from Global Constraints.

- [ ] **Step 1: Add import** near the other `./` imports at the top of `lib/builder/tools.ts`:

```ts
import { evaluatePathPolicy, evaluateFileBudget, formatPathPolicyViolations } from './path-policy';
```

- [ ] **Step 2: Update `PROPOSAL_PHASES`** (line ~56):

```ts
const PROPOSAL_PHASES = ['pending', 'plan_ready', 'queued', 'building', 'build_ready', 'reviewing', 'needs_repair', 'ready_to_apply', 'failed', 'pr_opened'] as const;
```

And replace the hardcoded enum in the `list_proposals` tool definition (line ~677) with:

```ts
          enum: [...PROPOSAL_PHASES],
```

- [ ] **Step 3: Enforce budget + policy in `validateProposalFiles`** — replace the `return files.map(...)` block's ending so the function becomes:

```ts
function validateProposalFiles(value: unknown): Array<{ path: string; content: string; diff: string }> {
  InputValidator.validateRequired(value, 'files');
  InputValidator.validateArray(value, 'files', { maxLength: 50 });
  const files = value as unknown[];
  if (files.length === 0) throw new Error('files must contain at least one file');

  const validated = files.map((file, index) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const item = file as Record<string, unknown>;
    return {
      path: validateBuilderPath(item.path, `files[${index}].path`),
      content: requiredString(item.content, `files[${index}].content`, { maxLength: 500_000, allowEmpty: true }),
      diff: requiredString(item.diff, `files[${index}].diff`, { maxLength: 500_000, allowEmpty: true }),
    };
  });

  const budgetError = evaluateFileBudget(validated);
  if (budgetError) throw new Error(budgetError);

  const policy = evaluatePathPolicy(validated.map(f => f.path));
  if (!policy.allowed) {
    throw new Error(`Proposal touches protected paths. ${formatPathPolicyViolations(policy.violations)}`);
  }

  return validated;
}
```

- [ ] **Step 4: Add `validateScaffoldPlanContent`** directly after `validateProposalFiles`:

```ts
function validateScaffoldPlanContent(value: unknown): ScaffoldPlanContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('plan must be a JSON object');
  const plan = value as Record<string, unknown>;
  const moduleName = requiredString(plan.moduleName, 'plan.moduleName', { maxLength: 120 });
  const moduleSlug = requiredString(plan.moduleSlug, 'plan.moduleSlug', { maxLength: 64, pattern: /^[a-z][a-z0-9_]*$/ });
  const moduleIcon = requiredString(plan.moduleIcon, 'plan.moduleIcon', { maxLength: 64 });
  if (!Array.isArray(plan.files) || plan.files.length === 0) throw new Error('plan.files must be a non-empty array');
  if (plan.files.length > 50) throw new Error('plan.files is limited to 50 files');

  const files = plan.files.map((file, index) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error(`plan.files[${index}] must be an object`);
    const item = file as Record<string, unknown>;
    return {
      path: validateBuilderPath(item.path, `plan.files[${index}].path`),
      description: requiredString(item.description, `plan.files[${index}].description`, { maxLength: 2000 }),
    };
  });

  const policy = evaluatePathPolicy(files.map(f => f.path));
  if (!policy.allowed) {
    throw new Error(`Plan touches protected paths. ${formatPathPolicyViolations(policy.violations)}`);
  }

  return {
    moduleName,
    moduleSlug,
    moduleIcon,
    tables: Array.isArray(plan.tables) ? (plan.tables as ScaffoldPlanContent['tables']) : [],
    files,
    registryEntry: typeof plan.registryEntry === 'string' ? plan.registryEntry : '',
    apiShape: typeof plan.apiShape === 'string' ? plan.apiShape : '',
  };
}
```

(`ScaffoldPlanContent` is declared later in the file at ~line 932; function declarations hoist type usage fine because this is a `function` referencing a type — TypeScript allows forward type references.)

- [ ] **Step 5: Route generic proposals through review** — in `case 'submit_code_proposal'` change the insert's `phase: 'ready_to_apply',` to `phase: 'plan_ready',` and update the tool definition description (line ~605) to:

```ts
    description: 'Submit a code change proposal. The proposal starts in implementation review: an implementation reviewer must run the automated build/review gate before a pull request can open. Never tell the user a PR will open immediately.',
```

- [ ] **Step 6: Validate the model plan in `case 'scaffold_module'`** — replace the parse block:

```ts
        let planContent: ScaffoldPlanContent;
        try {
          const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
          planContent = validateScaffoldPlanContent(JSON.parse(raw));
        } catch (e) {
          return { type: 'error', tool: toolName, message: `Plan validation failed: ${validationMessage(e)}` };
        }
```

- [ ] **Step 7: Fix `list_proposals` PR display** — replace the `prSuffix` line with:

```ts
          const prSuffix = p.pr_url ? ` | PR: ${p.pr_url}` : '';
```

- [ ] **Step 8: Sweep for other `ready_to_apply` writers**

Run: `grep -rn "ready_to_apply" lib app --include='*.ts' | grep -v __tests__ | grep -v "phase ===" | grep -v "'ready_to_apply'\]" `
Expected: the only remaining writers are `lib/builder/scaffold-worker.ts` (gate-controlled, Task 6). If any other insert/update writes it, fix it the same way.

- [ ] **Step 9: Run existing builder tool tests**

Run: `npx vitest run lib/builder/__tests__/scaffold-module-tool.test.ts lib/builder/__tests__/module-tools.test.ts lib/builder/__tests__/builder-tools-kpi.test.ts lib/builder/__tests__/builder-tools-workflow.test.ts`
Expected: PASS. If a text assertion expects `phase: 'ready_to_apply'` in `submit_code_proposal` or the old phase enum, update the assertion to the new truth (plan_ready / new `PROPOSAL_PHASES`).

- [ ] **Step 10: Commit**

```bash
git add lib/builder/tools.ts lib/builder/__tests__/
git commit -m "fix(builder): generic code proposals start in plan_ready; validate model plans and enforce path policy at tool input

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Scaffold worker — generic-proposal review, gate-controlled outcomes, failure phase

**Files:**
- Modify: `lib/builder/scaffold-worker.ts` (full rewrite below)
- Test: `lib/builder/__tests__/scaffold-worker.test.ts` (extend)

**Interfaces:**
- Consumes: `evaluatePathPolicy` (Task 2); `evaluateReviewGate`, `parseReviewReport`, `ReviewReport` (Task 3).
- Produces: worker consumes proposals in phase `queued` (set by Task 7's claim); outcomes are exactly `needs_repair | ready_to_apply | failed`. `enqueueScaffoldBuildJob` signature unchanged.

- [ ] **Step 1: Extend the text-contract test** — replace `lib/builder/__tests__/scaffold-worker.test.ts` body describing phases with (keep the file's existing read/setup shape; final content):

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold worker', () => {
  const src = readFileSync('lib/builder/scaffold-worker.ts', 'utf8');

  it('updates proposal phase to building when job starts', () => {
    expect(src).toMatch(/phase.*building|building.*phase/);
  });

  it('routes review outcomes through the review gate — never unconditionally ready_to_apply', () => {
    expect(src).toMatch(/evaluateReviewGate/);
    expect(src).toMatch(/needs_repair/);
    expect(src).toMatch(/gate\.pass \? 'ready_to_apply' : 'needs_repair'/);
  });

  it('enforces the path policy on generated files before review', () => {
    expect(src).toMatch(/evaluatePathPolicy/);
  });

  it('reviews supplied files for generic proposals instead of requiring a plan', () => {
    expect(src).toMatch(/generated_code/);
  });

  it('marks the proposal failed when a run fails', () => {
    expect(src).toMatch(/phase: 'failed'/);
  });

  it('treats unparseable review output as a blocking error, not a passing warning', () => {
    expect(src).not.toMatch(/score: 50/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
Expected: FAIL on the gate/path-policy/failed assertions.

- [ ] **Step 3: Rewrite `lib/builder/scaffold-worker.ts`:**

```ts
// lib/builder/scaffold-worker.ts
import { Queue, Worker, type Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { evaluatePathPolicy } from './path-policy';
import { evaluateReviewGate, parseReviewReport, type ReviewReport } from './review-gate';
import type { ScaffoldPlanContent } from './tools';
import { branding } from '@/lib/config';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const scaffoldQueue = new Queue('scaffold-jobs', { connection: redisConnection });

export interface ScaffoldBuildJobData {
  proposalId: string;
  orgId: string;
}

export async function enqueueScaffoldBuildJob(data: ScaffoldBuildJobData): Promise<string> {
  const job = await scaffoldQueue.add('scaffold-build', data, {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  });
  return job.id ?? '';
}

export function createScaffoldWorker(): Worker {
  const worker = new Worker(
    'scaffold-jobs',
    async (job: Job) => {
      if (job.name === 'scaffold-build') {
        await runBuildPhase(job.data as ScaffoldBuildJobData);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[scaffold-worker] Job ${job?.id} failed:`, err.message);
    const data = job?.data as ScaffoldBuildJobData | undefined;
    if (data?.proposalId) {
      void markProposalRunFailed(data.proposalId, err.message);
    }
  });

  worker.on('completed', (job) => {
    console.log(`[scaffold-worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

async function markProposalRunFailed(proposalId: string, message: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from('builder_proposals')
      .update({
        phase: 'failed',
        review_report: {
          score: 0,
          findings: [{ severity: 'error', description: `Run failed before review completed: ${message.slice(0, 500)}` }],
        },
      })
      .eq('id', proposalId);
  } catch (updateError) {
    console.error(`[scaffold-worker] Could not mark proposal ${proposalId} failed:`, updateError);
  }
}

async function runBuildPhase(data: ScaffoldBuildJobData): Promise<void> {
  const { proposalId } = data;
  const supabase = createAdminClient();

  const { data: proposal, error: fetchError } = await supabase
    .from('builder_proposals')
    .select('plan_content, generated_code, org_id')
    .eq('id', proposalId)
    .single();

  if (fetchError || !proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'building' })
    .eq('id', proposalId);

  const planContent = proposal.plan_content as ScaffoldPlanContent | null;
  let generatedFiles: Array<{ path: string; content: string }>;

  if (planContent?.files?.length) {
    generatedFiles = await generateFilesFromPlan(supabase, proposalId, planContent);
  } else {
    // Generic proposals arrive with their files already attached; they skip
    // generation and go straight to policy check + review.
    const supplied = (proposal.generated_code as { files?: Array<{ path: string; content: string }> } | null)?.files ?? [];
    if (supplied.length === 0) {
      throw new Error(`Proposal ${proposalId} has no plan and no supplied files to review`);
    }
    generatedFiles = supplied;
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'build_ready' })
    .eq('id', proposalId);

  const policy = evaluatePathPolicy(generatedFiles.map(f => f.path));
  if (!policy.allowed) {
    const report: ReviewReport = {
      score: 0,
      findings: policy.violations.map(v => ({ severity: 'error', description: `Protected path ${v.path}: ${v.detail}` })),
    };
    await supabase
      .from('builder_proposals')
      .update({ phase: 'needs_repair', review_report: report })
      .eq('id', proposalId);
    return;
  }

  await runReviewPhase(proposalId, planContent, generatedFiles);
}

async function generateFilesFromPlan(
  supabase: ReturnType<typeof createAdminClient>,
  proposalId: string,
  planContent: ScaffoldPlanContent
): Promise<Array<{ path: string; content: string }>> {
  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);
  const systemPrompt = `You are a senior software engineer implementing a module for the ${branding.appName} platform.${contextPrompt}`;

  const provider = createAIProvider();
  const generatedFiles: Array<{ path: string; content: string }> = [];

  for (const file of planContent.files) {
    const userPrompt = `Module plan:\n${JSON.stringify(planContent, null, 2)}\n\nImplement this specific file: ${file.path}\n${file.description}\n\nReturn ONLY the complete file content with no explanation or markdown fences.`;

    const response = await provider.createMessage({
      model: AI_MODELS.scaffoldBuild,
      maxTokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';
    generatedFiles.push({ path: file.path, content });

    await supabase
      .from('builder_proposals')
      .update({ generated_code: { files: generatedFiles } })
      .eq('id', proposalId);
  }

  return generatedFiles;
}

async function runReviewPhase(
  proposalId: string,
  planContent: ScaffoldPlanContent | null,
  generatedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('builder_proposals')
    .update({ phase: 'reviewing' })
    .eq('id', proposalId);

  const provider = createAIProvider();

  const filesText = generatedFiles
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n');

  const planText = planContent
    ? JSON.stringify(planContent, null, 2)
    : 'No structured plan: this is a directly submitted code proposal. Review the files on their own merits.';

  const reviewPrompt = `Review this proposed implementation against the plan and ${branding.appName} codebase standards.

Module plan:
${planText}

Proposed files:
${filesText}

Check for:
1. Missing auth guards (org-scoped routes must check can_view_org, is_org_admin, user_org_role, or the implementation-reviewer capability as appropriate)
2. RLS policy gaps (every new table needs read/write/service_role policies)
3. Naming inconsistencies (slug, table names, component names must be consistent; org-scoped FK columns are org_id)
4. Type mismatches (TypeScript types should match DB column definitions)

Respond with ONLY a valid JSON object (no markdown fences):
{
  "score": 85,
  "findings": [
    { "severity": "error", "description": "..." },
    { "severity": "warning", "description": "..." }
  ]
}

Severity contract: use "error" for anything that must block a pull request (security, org isolation, RLS, schema canon violations, broken code). Use "warning" for improvements. The score is a summary only; it does not gate anything.`;

  const response = await provider.createMessage({
    model: AI_MODELS.scaffoldReview,
    maxTokens: 2048,
    messages: [{ role: 'user', content: reviewPrompt }],
    system: 'You are a senior code reviewer. Return only valid JSON.',
  });

  const textBlock = response.content.find(b => b.type === 'text');
  let reviewReport: ReviewReport = {
    score: 0,
    findings: [{ severity: 'error', description: 'Automated review produced no output. Retry the run before opening a PR.' }],
  };

  if (textBlock?.type === 'text') {
    try {
      const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
      const validated = parseReviewReport(JSON.parse(raw));
      reviewReport = validated ?? {
        score: 0,
        findings: [{ severity: 'error', description: 'Automated review returned a malformed report. Retry the run before opening a PR.' }],
      };
    } catch {
      reviewReport = {
        score: 0,
        findings: [{ severity: 'error', description: 'Automated review output could not be parsed. Retry the run before opening a PR.' }],
      };
    }
  }

  const gate = evaluateReviewGate(reviewReport);

  await supabase
    .from('builder_proposals')
    .update({ phase: gate.pass ? 'ready_to_apply' : 'needs_repair', review_report: reviewReport })
    .eq('id', proposalId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/builder/scaffold-worker.ts lib/builder/__tests__/scaffold-worker.test.ts
git commit -m "fix(builder): worker gates review outcomes, reviews generic proposals, records failed runs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Atomic build-run claim (build route)

**Files:**
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts` (full rewrite below)
- Test: create `app/api/__tests__/builder-build-claim.test.ts`
- Test: existing `lib/builder/__tests__/scaffold-endpoints.test.ts` (its `plan_ready` assertion still matches)

**Interfaces:**
- Consumes: `enqueueScaffoldBuildJob({ proposalId, orgId })` (Task 6, unchanged signature); `canReviewImplementation` (existing).
- Produces: response contracts — winner `200 {jobId, proposalId}`; concurrent duplicate `200 {proposalId, alreadyRunning: true}`; wrong phase `409`; not found `404`. Claimable phases: `plan_ready | needs_repair | failed`. In-flight phases: `queued | building | build_ready | reviewing`.

- [ ] **Step 1: Write the failing behavioral test** — `app/api/__tests__/builder-build-claim.test.ts`:

```ts
// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/build
// The route must atomically claim the proposal (compare-and-set on phase)
// before enqueueing, so two concurrent starts produce one job.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _canReview = true;
let _claimResult: { id: string } | null = { id: PROPOSAL_ID };
let _claimPhases: string[] = [];
let _updateValues: Array<Record<string, unknown>> = [];
let _fetchRow: { id: string; phase: string } | null = null;

const enqueueMock = vi.fn(async () => 'job-1');

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'builder_proposals') throw new Error(`unexpected table ${table}`);
      const claimChain: any = {
        eq: () => claimChain,
        in: (_col: string, phases: string[]) => { _claimPhases = phases; return claimChain; },
        select: () => claimChain,
        maybeSingle: async () => ({ data: _claimResult, error: null }),
        // The reset-on-enqueue-failure path awaits update().eq().eq() directly.
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      };
      const fetchChain: any = {
        eq: () => fetchChain,
        maybeSingle: async () => ({ data: _fetchRow, error: null }),
      };
      return {
        update: (values: Record<string, unknown>) => { _updateValues.push(values); return claimChain; },
        select: () => fetchChain,
      };
    },
  })),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

vi.mock('@/lib/builder/scaffold-worker', () => ({
  enqueueScaffoldBuildJob: (data: unknown) => enqueueMock(data),
}));

import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/build/route';

function call() {
  return POST(new NextRequest('http://localhost/api/build', { method: 'POST' }), {
    params: Promise.resolve({ orgId: ORG_ID, proposalId: PROPOSAL_ID }),
  });
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _canReview = true;
  _claimResult = { id: PROPOSAL_ID };
  _claimPhases = [];
  _updateValues = [];
  _fetchRow = null;
  enqueueMock.mockClear();
  enqueueMock.mockResolvedValue('job-1');
});

describe('POST build — auth', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    const res = await call();
    expect(res.status).toBe(403);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe('POST build — atomic claim', () => {
  it('claims via compare-and-set on retryable phases and enqueues exactly one job', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ jobId: 'job-1', proposalId: PROPOSAL_ID });
    expect(_updateValues[0]).toEqual({ phase: 'queued' });
    expect(_claimPhases).toEqual(['plan_ready', 'needs_repair', 'failed']);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({ proposalId: PROPOSAL_ID, orgId: ORG_ID });
  });

  it('returns alreadyRunning without enqueueing when a run is in flight (lost the claim)', async () => {
    _claimResult = null;
    _fetchRow = { id: PROPOSAL_ID, phase: 'building' };
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ proposalId: PROPOSAL_ID, alreadyRunning: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('409 when the proposal is not in a claimable phase', async () => {
    _claimResult = null;
    _fetchRow = { id: PROPOSAL_ID, phase: 'pr_opened' };
    const res = await call();
    expect(res.status).toBe(409);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('404 when the proposal does not exist in this org', async () => {
    _claimResult = null;
    _fetchRow = null;
    const res = await call();
    expect(res.status).toBe(404);
  });

  it('resets the claim to failed when the queue rejects the job', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(_updateValues).toEqual([{ phase: 'queued' }, { phase: 'failed' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/__tests__/builder-build-claim.test.ts`
Expected: FAIL — current route selects `plan_ready` then enqueues; no `.in()` claim, no alreadyRunning path.

- [ ] **Step 3: Rewrite the route** — `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';
import { canReviewImplementation } from '@/lib/org-capabilities';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

// Phases from which a reviewer may start (or retry) a run, and phases that
// mean a run is already active. Any other phase is a state-machine violation.
const CLAIMABLE_PHASES = ['plan_ready', 'needs_repair', 'failed'];
const IN_FLIGHT_PHASES = ['queued', 'building', 'build_ready', 'reviewing'];

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const canReview = await canReviewImplementation(supabase as any, orgId);
    if (!canReview) {
      return json({ error: 'Implementation reviewer access required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    // Atomic compare-and-set claim: only one caller can move the proposal
    // into `queued`; a concurrent duplicate start updates zero rows.
    const { data: claimed, error: claimError } = await adminSupabase
      .from('builder_proposals')
      .update({ phase: 'queued' })
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .in('phase', CLAIMABLE_PHASES)
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;

    if (!claimed) {
      const { data: proposal, error: fetchError } = await adminSupabase
        .from('builder_proposals')
        .select('id, phase')
        .eq('id', proposalId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!proposal) return json({ error: 'Proposal not found' }, { status: 404 });
      if (IN_FLIGHT_PHASES.includes(proposal.phase ?? '')) {
        return json({ proposalId, alreadyRunning: true });
      }
      return json(
        { error: `Proposal must be in one of [${CLAIMABLE_PHASES.join(', ')}] to start a run, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    try {
      const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId });
      return json({ jobId, proposalId });
    } catch (queueError) {
      // Don't strand the proposal in `queued` with no job behind it.
      await adminSupabase
        .from('builder_proposals')
        .update({ phase: 'failed' })
        .eq('id', proposalId)
        .eq('org_id', orgId);
      throw queueError;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/__tests__/builder-build-claim.test.ts lib/builder/__tests__/scaffold-endpoints.test.ts`
Expected: PASS (scaffold-endpoints' `/phase.*plan_ready|plan_ready.*phase/` still matches `CLAIMABLE_PHASES`).

- [ ] **Step 5: Commit**

```bash
git add "app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts" app/api/__tests__/builder-build-claim.test.ts
git commit -m "fix(builder): atomic compare-and-set claim for build runs; retry from needs_repair/failed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Apply-route release gate

**Files:**
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts`
- Test: create `app/api/__tests__/builder-apply-gate.test.ts`
- Test: extend `lib/builder/__tests__/scaffold-endpoints.test.ts` apply describe-block

**Interfaces:**
- Consumes: `evaluatePathPolicy`, `formatPathPolicyViolations` (Task 2); `evaluateReviewGate` (Task 3).
- Produces: gate order after existing phase check — files nonempty (400, existing) → path policy (422 with `violations`) → review gate (409 with `blockers`). Success unchanged: `200 { prUrl }`, phase → `pr_opened`, status → `approved`.

- [ ] **Step 1: Write the failing behavioral test** — `app/api/__tests__/builder-apply-gate.test.ts`:

```ts
// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/apply
// The release gate: a PR may open only for a ready_to_apply proposal whose
// stored review report passes the review gate and whose files pass the
// path policy. A model score is never an authorization signal.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _canReview = true;
let _githubConfigured = true;
let _proposalRow: Record<string, unknown> | null = null;
let _updateCalls: Array<Record<string, unknown>> = [];
let _eventInserts: Array<Record<string, unknown>> = [];

const applyMock = vi.fn(async () => ({
  prUrl: 'https://github.com/acme/repo/pull/7',
  branchName: 'builder/scaffold-22222222',
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'builder_proposals') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: _proposalRow,
                  error: _proposalRow ? null : { message: 'not found' },
                }),
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            _updateCalls.push(values);
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'builder_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            _eventInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock('@/lib/builder/github-apply', () => ({
  isGitHubConfigured: () => _githubConfigured,
  applyProposalToGitHub: (...args: unknown[]) => applyMock(...args),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route';

function call() {
  return POST(new NextRequest('http://localhost/api/apply', { method: 'POST' }), {
    params: Promise.resolve({ orgId: ORG_ID, proposalId: PROPOSAL_ID }),
  });
}

function healthyProposal(): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    phase: 'ready_to_apply',
    plan_content: { moduleName: 'Volunteer Tracking' },
    generated_code: {
      files: [{ path: 'components/volunteer/VolunteerList.tsx', content: 'export default function VolunteerList() { return null; }' }],
    },
    review_report: { score: 88, findings: [{ severity: 'warning', description: 'Consider an empty state.' }] },
  };
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _canReview = true;
  _githubConfigured = true;
  _proposalRow = healthyProposal();
  _updateCalls = [];
  _eventInserts = [];
  applyMock.mockClear();
});

describe('POST apply — auth and preconditions', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    expect((await call()).status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    expect((await call()).status).toBe(403);
  });

  it('503 when GitHub is not configured', async () => {
    _githubConfigured = false;
    expect((await call()).status).toBe(503);
  });

  it('404 when the proposal does not exist in this org', async () => {
    _proposalRow = null;
    expect((await call()).status).toBe(404);
  });

  it('409 when the proposal is not ready_to_apply', async () => {
    _proposalRow = { ...healthyProposal(), phase: 'needs_repair' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('400 when there are no files', async () => {
    _proposalRow = { ...healthyProposal(), generated_code: { files: [] } };
    expect((await call()).status).toBe(400);
  });
});

describe('POST apply — release gate', () => {
  it('422 with violations when a file touches a protected path — GitHub is never called', async () => {
    _proposalRow = {
      ...healthyProposal(),
      generated_code: { files: [{ path: '.github/workflows/deploy.yml', content: 'on: push' }] },
    };
    const res = await call();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.violations?.length).toBeGreaterThan(0);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 with blockers when the review report has a blocking finding, even with a high score', async () => {
    _proposalRow = {
      ...healthyProposal(),
      review_report: { score: 97, findings: [{ severity: 'error', description: 'New table has no RLS policies.' }] },
    };
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.blockers).toEqual(['New table has no RLS policies.']);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the review report is missing — a phase value alone is not evidence', async () => {
    _proposalRow = { ...healthyProposal(), review_report: null };
    const res = await call();
    expect(res.status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('opens the PR and records pr_opened for a passing proposal', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prUrl).toBe('https://github.com/acme/repo/pull/7');
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(_updateCalls[0]).toMatchObject({ phase: 'pr_opened', status: 'approved', pr_url: 'https://github.com/acme/repo/pull/7' });
    expect(_eventInserts[0]).toMatchObject({ org_id: ORG_ID, event_type: 'proposal_applied' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/__tests__/builder-apply-gate.test.ts`
Expected: FAIL on the two gate tests (protected path currently reaches GitHub; blocking finding currently opens a PR).

- [ ] **Step 3: Add the gate to the route** — in `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts`, add imports:

```ts
import { evaluatePathPolicy, formatPathPolicyViolations } from '@/lib/builder/path-policy';
import { evaluateReviewGate } from '@/lib/builder/review-gate';
```

Then insert after the existing `if (files.length === 0)` check and before `applyProposalToGitHub`:

```ts
    const policy = evaluatePathPolicy(files.map(f => f.path));
    if (!policy.allowed) {
      return json(
        {
          error: `Proposal touches protected paths. ${formatPathPolicyViolations(policy.violations)}`,
          violations: policy.violations,
        },
        { status: 422 }
      );
    }

    const gate = evaluateReviewGate(proposal.review_report);
    if (!gate.pass) {
      return json(
        {
          error: gate.reason ?? 'Automated review has not passed for this proposal.',
          blockers: gate.blockers,
        },
        { status: 409 }
      );
    }
```

- [ ] **Step 4: Extend the text-contract test** — in `lib/builder/__tests__/scaffold-endpoints.test.ts`, add to the `org-scoped apply endpoint` describe:

```ts
  it('enforces the path policy and review gate before GitHub', () => {
    expect(src).toMatch(/evaluatePathPolicy/);
    expect(src).toMatch(/evaluateReviewGate/);
    expect(src).toMatch(/422/);
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/__tests__/builder-apply-gate.test.ts lib/builder/__tests__/scaffold-endpoints.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts" app/api/__tests__/builder-apply-gate.test.ts lib/builder/__tests__/scaffold-endpoints.test.ts
git commit -m "fix(builder): apply route enforces path policy and fail-closed review gate before opening a PR

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Retire manual shipping (route + Studio UI)

**Files:**
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/ship/route.ts` (full rewrite)
- Modify: `components/builder-studio/StudioProposalsPanel.tsx`
- Test: create `app/api/__tests__/builder-ship-retired.test.ts`

**Interfaces:**
- Consumes: `PROPOSAL_LIFECYCLE_STATUSES` from Task 4 (STATUS_CLASS must cover all ten statuses).
- Produces: `POST .../ship` always returns 410; Studio has no "Mark shipped" action; `needs_repair`/`run_failed` proposals get a "Retry review run" action that calls the existing build endpoint.

- [ ] **Step 1: Write the failing test** — `app/api/__tests__/builder-ship-retired.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/ship/route';

describe('POST ship — retired', () => {
  it('always returns 410 Gone; delivery status is never a manual assertion', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/retired/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/__tests__/builder-ship-retired.test.ts`
Expected: FAIL (current handler takes params and hits Supabase mocks that don't exist → throws/500, or type error on zero-arg call).

- [ ] **Step 3: Rewrite the ship route:**

```ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Retired (audit Phase 0, item 5): delivery status must come from verified
// GitHub merge and deployment facts, not a reviewer assertion. Proposals now
// stop at pr_opened until verified delivery records ship (audit Phase 6).
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Manual ship confirmation has been retired. A proposal stops at pr_opened; merge and deployment status will come from verified provider events.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 4: Update `components/builder-studio/StudioProposalsPanel.tsx`:**

1. Remove `markShipped`, the `shippingId` state, and the "Mark shipped" button block (the `lifecycle === 'pr_opened' && canReviewImplementation` button). Remove now-unused `CheckCircle2` from the lucide import if nothing else uses it.
2. Replace `STATUS_CLASS` with full coverage of the new statuses:

```ts
const STATUS_CLASS: Record<ProposalLifecycleStatus, string> = {
  drafted: 'border-neutral-200 bg-neutral-50 text-neutral-700',
  awaiting_approval: 'border-blue-200 bg-blue-50 text-blue-700',
  applied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_implementation_review: 'border-amber-200 bg-amber-50 text-amber-800',
  in_review: 'border-violet-200 bg-violet-50 text-violet-700',
  needs_repair: 'border-orange-200 bg-orange-50 text-orange-800',
  ready_to_apply: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  run_failed: 'border-red-200 bg-red-50 text-red-700',
  pr_opened: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};
```

3. Change the "Open pull request" button condition from `proposal.phase === 'ready_to_apply' && !proposal.pr_url` to `lifecycle === 'ready_to_apply' && !proposal.pr_url`.
4. Add a retry action for gate failures, immediately after the "Start implementation review" button block (reuses `startImplementationReview` — the build route now accepts `needs_repair`/`failed`):

```tsx
              {(lifecycle === 'needs_repair' || lifecycle === 'run_failed') && canReviewImplementation ? <button onClick={() => startImplementationReview(proposal.id)} disabled={startingId === proposal.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />{startingId === proposal.id ? 'Starting...' : 'Retry review run'}</button> : null}
```

5. Show blocking findings so the reviewer sees *why* it is blocked — replace the review-report score line with:

```tsx
              {proposal.review_report ? <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white px-2 py-1 text-neutral-700">Review score: {proposal.review_report.score ?? 'pending'}</span><span className="text-neutral-500">{proposal.review_report.findings?.length || 0} finding{proposal.review_report.findings?.length === 1 ? '' : 's'}</span></div>
                {(proposal.review_report.findings || []).slice(0, 5).map((finding, index) => <div key={index} className={`rounded px-2 py-1 text-xs ${finding.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-white text-neutral-600'}`}><span className="font-semibold uppercase">{finding.severity}</span> {finding.description}</div>)}
              </div> : null}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run app/api/__tests__/builder-ship-retired.test.ts && npx tsc --noEmit`
Expected: test PASS; `tsc` reports no errors in `StudioProposalsPanel.tsx`, `proposal-lifecycle.ts`, or the builder routes (pre-existing unrelated errors, if any, are out of scope — note them, don't fix them here).

- [ ] **Step 6: Commit**

```bash
git add "app/api/org/[orgId]/builder/proposals/[proposalId]/ship/route.ts" app/api/__tests__/builder-ship-retired.test.ts components/builder-studio/StudioProposalsPanel.tsx
git commit -m "feat(builder): retire manual ship assertion; Studio shows gate evidence and retry action

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Documentation truth sweep

**Files:**
- Modify: `docs/BUILDER_OPERATIONS.md`

- [ ] **Step 1: Replace the final paragraph** ("Generic code proposals already contain…") of `docs/BUILDER_OPERATIONS.md` with:

```md
## Proposal review gate

Every code proposal — generic (`submit_code_proposal`) and scaffolded (`scaffold_module`) — starts in `plan_ready` and must pass the automated review gate before a pull request can open:

1. An implementation reviewer starts a run (`POST /api/org/[orgId]/builder/proposals/[proposalId]/build`). The start is an atomic claim: duplicate requests while a run is active return `alreadyRunning` and never enqueue a second job. Runs can be retried from `needs_repair` and `failed`.
2. The worker generates files (scaffold) or takes the supplied files (generic), enforces the protected-path policy (`lib/builder/path-policy.ts`), and runs the automated review.
3. Blocking findings, protected paths, or an unreadable review report leave the proposal in `needs_repair`; an infrastructure failure leaves it in `failed`.
4. Only a proposal in `ready_to_apply` whose stored review report passes the gate (`lib/builder/review-gate.ts` — blocking findings, not score) can open a PR. The apply endpoint re-checks the report and the path policy before writing to GitHub.
5. Proposals stop at `pr_opened`. Merge and deployment are handled through the normal engineering release process; the manual "mark shipped" action is retired until verified delivery records exist.
```

- [ ] **Step 2: Sweep for stale claims**

Run: `grep -rn "opened as PRs directly\|Mark shipped\|mark it shipped\|marked shipped" docs components app lib --include='*.md' --include='*.ts' --include='*.tsx' | grep -v BUILDER_REVIEW_ORCHESTRATION_AUDIT | grep -v agent-work/plans`
Expected: only the retired ship route's own message (allowed) — fix any other hit to the new language.

- [ ] **Step 3: Commit**

```bash
git add docs/BUILDER_OPERATIONS.md
git commit -m "docs(builder): document the phase-0 review gate; remove direct-to-PR language

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

- [ ] **Step 1: Full unit/behavioral suite**

Run: `npx vitest run`
Expected: PASS. Fix any regression this plan introduced (pre-existing failures unrelated to builder files: note, don't fix).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in files this plan touched.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint lib/builder/path-policy.ts lib/builder/review-gate.ts lib/builder/proposal-lifecycle.ts lib/builder/scaffold-worker.ts lib/builder/tools.ts components/builder-studio/StudioProposalsPanel.tsx "app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts" "app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts" "app/api/org/[orgId]/builder/proposals/[proposalId]/ship/route.ts"`
Expected: clean.

- [ ] **Step 4: Audit exit-criteria check** (Phase 0): confirm each with the test that proves it —
  - Generic proposal cannot open a PR: `submit_code_proposal` inserts `plan_ready` (Task 5) + apply gate requires passing report (Task 8 test).
  - Two concurrent starts produce one active job: CAS claim test (Task 7).
  - Protected path → 422, blocker finding / missing report → 409, both non-PR-eligible: Task 8 tests.
  - No document says generic proposals go directly to PRs: Task 10 sweep.

- [ ] **Step 5: Commit any stragglers**

```bash
git status --short
```
Expected: clean; if verification required fixes, commit them with a descriptive message.
