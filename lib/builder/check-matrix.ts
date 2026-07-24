// lib/builder/check-matrix.ts
//
// Builder Increment 3 — isolated deterministic verifier.
//
// Pure module: check definitions (what command runs for each verify:* key)
// and change-class classification (which checks a given set of changed
// paths requires). No I/O beyond the package.json contract test reading
// the repo's own package.json to keep the developer-facing scripts and the
// runner's scoped argv from silently diverging.

export const CHECK_KEYS = ['verify:types', 'verify:lint', 'verify:unit', 'verify:migrations', 'verify:build'] as const;
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

const MIGRATION_PREFIX = 'db/migrations/';
const BUILD_PREFIXES = ['app/', 'components/', 'contexts/'];
const BUILD_EXACT = ['middleware.ts', 'package.json'];
const BUILD_PATTERNS = [/^next\.config\.[a-z]+$/, /^tailwind\.config\.[a-z]+$/, /^postcss\.config\.[a-z]+$/, /^tsconfig(\..+)?\.json$/];

const SCHEMA_CONTRACT_SUITE = 'app/api/__tests__/builder-schema-contract.test.ts';
const API_CONTRACT_SUITE_GLOB = 'app/api/__tests__/*.test.ts';
const API_PREFIX = 'app/api/';
const UNIT_FLOOR_ARGV = ['npx', 'vitest', 'run', 'lib/builder'];

const TEST_DIR_PATTERN = /(^|\/)__tests__\//;
const TEST_SUFFIX_PATTERN = /\.(test|spec)\.[jt]sx?$/;

/** .ts/.tsx/.js/.jsx */
export function isLintablePath(p: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(p);
}

function isBuildRelevant(p: string): boolean {
  if (BUILD_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (BUILD_EXACT.includes(p)) return true;
  if (BUILD_PATTERNS.some((re) => re.test(p))) return true;
  return false;
}

/** Change-class matrix. types/lint/unit always; migrations iff db/migrations/**; build iff app|components|contexts|config. */
export function requiredCheckKeys(paths: string[]): CheckKey[] {
  const required = new Set<CheckKey>(['verify:types', 'verify:lint', 'verify:unit']);
  for (const p of paths) {
    if (p.startsWith(MIGRATION_PREFIX)) required.add('verify:migrations');
    if (isBuildRelevant(p)) required.add('verify:build');
  }
  // Preserve CHECK_KEYS order for a deterministic, deduplicated result.
  return CHECK_KEYS.filter((key) => required.has(key));
}

/** Targeted vitest selection: source files -> `vitest related` inputs + always-on contract suites for changed routes/schema. */
export function unitTestTargets(paths: string[]): { relatedFiles: string[]; extraSuiteGlobs: string[] } {
  const relatedFiles = Array.from(
    new Set(paths.filter((p) => isLintablePath(p) && !TEST_DIR_PATTERN.test(p) && !TEST_SUFFIX_PATTERN.test(p)))
  ).sort();

  const extraSuiteGlobs = new Set<string>();
  if (paths.some((p) => p.startsWith(MIGRATION_PREFIX))) {
    extraSuiteGlobs.add(SCHEMA_CONTRACT_SUITE);
  }
  if (paths.some((p) => p.startsWith(API_PREFIX))) {
    extraSuiteGlobs.add(API_CONTRACT_SUITE_GLOB);
  }

  return { relatedFiles, extraSuiteGlobs: Array.from(extraSuiteGlobs).sort() };
}

export const CHECK_COMMANDS: Record<CheckKey, CheckCommandSpec> = {
  'verify:types': {
    key: 'verify:types',
    argv: () => ['npx', 'tsc', '--noEmit'],
    versionArgv: ['npx', 'tsc', '--version'],
    timeoutMs: 300000,
  },
  'verify:lint': {
    key: 'verify:lint',
    argv: ({ changedFiles }) => {
      const files = changedFiles.filter(isLintablePath).sort();
      if (files.length === 0) return [];
      return ['npx', 'eslint', ...files];
    },
    versionArgv: ['npx', 'eslint', '--version'],
    timeoutMs: 300000,
  },
  'verify:unit': {
    key: 'verify:unit',
    argv: ({ changedFiles }) => {
      const { relatedFiles, extraSuiteGlobs } = unitTestTargets(changedFiles);
      if (relatedFiles.length === 0 && extraSuiteGlobs.length === 0) {
        return [...UNIT_FLOOR_ARGV];
      }
      return ['npx', 'vitest', 'run', 'related', ...relatedFiles, ...extraSuiteGlobs];
    },
    versionArgv: ['npx', 'vitest', '--version'],
    timeoutMs: 600000,
  },
  'verify:migrations': {
    key: 'verify:migrations',
    // The ONLY shell-string check: it chains a reset and a post-reset assertion
    // script, and spawn() can't express `&&` without a shell.
    argv: () => ['bash', '-lc', 'npx supabase db reset && bash scripts/verify/migrations-assert.sh'],
    versionArgv: ['npx', 'supabase', '--version'],
    timeoutMs: 600000,
  },
  'verify:build': {
    key: 'verify:build',
    argv: () => ['npx', 'next', 'build'],
    versionArgv: ['npx', 'next', '--version'],
    timeoutMs: 900000,
    envOverrides: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  },
};
