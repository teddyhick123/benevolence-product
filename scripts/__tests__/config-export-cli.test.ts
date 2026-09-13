// @vitest-environment node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '@/lib/org-import/connection';

const execFileAsync = promisify(execFile);
const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ROOT = process.cwd();
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

describe('config:export', () => {
  it('writes a valid artifact only to stdout and diagnostics to stderr', async () => {
    const orgId = randomUUID();
    await withTransaction(async tx => {
      await tx.query(
        `INSERT INTO public.organizations (id, name, org_type, modules)
         VALUES ($1, 'CLI Export Foundation', 'private_foundation', '{"portfolio": true}'::jsonb)`, [orgId]);
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/config-export.ts', '--org', orgId],
      {
        cwd: ROOT,
        env: { ...process.env, SUPABASE_DB_URL: process.env.SUPABASE_DB_URL!, TS_NODE_PROJECT: 'tsconfig.scripts.json' },
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      formatVersion: 1,
      metadata: { sourceOrgName: 'CLI Export Foundation' },
      modules: ['portfolio'],
    });
    expect(stderr).toMatch(/Exported configuration template sha256=[a-f0-9]{64}/);
  });
});
