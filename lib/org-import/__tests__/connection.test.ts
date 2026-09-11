// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { withTransaction, databaseUrl } from '@/lib/org-import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

beforeAll(() => {
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL;
});

describe('withTransaction', () => {
  it('commits when the callback resolves', async () => {
    const id = await withTransaction(async tx => {
      await tx.query(`CREATE TEMP TABLE tx_probe (id int)`);
      await tx.query(`INSERT INTO tx_probe VALUES (1)`);
      const { rows } = await tx.query<{ id: number }>(`SELECT id FROM tx_probe`);
      return rows[0].id;
    });
    expect(id).toBe(1);
  });

  // The requirement this whole file exists for: a failure must leave nothing.
  it('rolls back everything when the callback throws', async () => {
    const table = `rollback_probe_${Date.now()}`;
    await expect(withTransaction(async tx => {
      await tx.query(`CREATE TABLE public.${table} (id int)`);
      throw new Error('deliberate');
    })).rejects.toThrow('deliberate');

    const survived = await withTransaction(async tx => {
      const { rows } = await tx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.tables
         WHERE table_schema='public' AND table_name=$1`, [table]);
      return rows[0].n;
    });
    expect(survived).toBe('0');
  });

  it('names the missing configuration rather than failing obscurely', () => {
    const saved = process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_DB_URL;
    expect(() => databaseUrl()).toThrow(/SUPABASE_DB_URL/);
    process.env.SUPABASE_DB_URL = saved;
  });
});
