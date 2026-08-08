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
  'agents.md',
  'claude.md',
  'package.json',
  'tsconfig.json',
  'middleware.ts',
  'app/middleware.ts',
  'lib/supabase.ts',
  'lib/org-capabilities.ts',
  'lib/api/client.ts',
  'lib/api/client-hooks.ts',
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
  const normalizedPaths = paths.map(normalizeProposalPath);

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
      violations.push({ path: raw, rule: 'protected-file', detail: 'Agent-policy, security-, and build-critical files cannot be proposed.' });
    }
    const migration = migrationDetail(path);
    if (migration) {
      violations.push({ path: raw, rule: 'migration-rewrite', detail: migration });
    }
  }

  const proposesMigration = normalizedPaths.some((path) => path.startsWith('db/migrations/'));
  if (proposesMigration && !normalizedPaths.includes('lib/database.types.ts')) {
    violations.push({
      path: 'lib/database.types.ts',
      rule: 'migration-types',
      detail: 'Migration proposals must include regenerated lib/database.types.ts.',
    });
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
