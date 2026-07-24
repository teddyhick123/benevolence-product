// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildSandboxEnv, FORBIDDEN_ENV_VARS, SANDBOX_ENV_FIXED } from '@/lib/builder/sandbox-env';

const hostile: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
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
