/**
 * Sandbox environment allowlist for Builder verification subprocesses.
 *
 * The Builder worker process loads the same .env files as the main Next.js
 * app and therefore has access to production secrets (SUPABASE_SERVICE_ROLE,
 * ANTHROPIC_API_KEY, GITHUB_TOKEN, REDIS_URL, DATABASE_URL, etc.). When it
 * spawns subprocesses to run Builder-proposal-modified code (typecheck,
 * lint, tests), those subprocesses must never see those secrets or any
 * GitHub write credential.
 *
 * buildSandboxEnv is the enforcement point: an ALLOWLIST (not a denylist).
 * It starts from an empty object, copies in only the explicitly named safe
 * variables from the host environment, layers on a small set of fixed
 * placeholder values, then applies per-check overrides last. Anything not
 * explicitly named in SANDBOX_ENV_ALLOWLIST or SANDBOX_ENV_FIXED is dropped,
 * regardless of what it's called or what it looks like.
 */

/** Vars copied from the host env when present. Everything else is dropped. */
export const SANDBOX_ENV_ALLOWLIST = ['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','SHELL','USER','NODE_OPTIONS_SAFE_UNUSED'] as const;

/** Always-set values (placeholders are obviously fake; NEVER real secrets). */
export const SANDBOX_ENV_FIXED: Record<string, string> = {
  CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sandbox-placeholder-anon-key',
};

export const FORBIDDEN_ENV_VARS = ['SUPABASE_SERVICE_ROLE','SUPABASE_SERVICE_KEY','SUPABASE_ACCESS_TOKEN','ANTHROPIC_API_KEY','GITHUB_TOKEN','REDIS_URL','DATABASE_URL'] as const;

export function buildSandboxEnv(base: NodeJS.ProcessEnv, overrides?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SANDBOX_ENV_ALLOWLIST) {
    const value = base[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  Object.assign(env, SANDBOX_ENV_FIXED);

  if (overrides) {
    Object.assign(env, overrides);
  }

  return env;
}
