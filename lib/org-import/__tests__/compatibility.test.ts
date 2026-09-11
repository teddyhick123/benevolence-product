// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { checkSchemaCompatibility, assertOrgAbsent } from '@/lib/org-import/compatibility';
import { withTransaction } from '@/lib/org-import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ledger = (...versions: string[]) => versions.map(version => ({ version }));

describe('checkSchemaCompatibility', () => {
  it('accepts an identical schema', () => {
    expect(checkSchemaCompatibility(ledger('0001', '0002'), ['0001', '0002']).ok).toBe(true);
  });

  it('accepts a target that is ahead, with a warning', () => {
    const result = checkSchemaCompatibility(ledger('0001'), ['0001', '0002']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toMatch(/0002/);
  });

  // The refusal that matters. jsonb_populate_record drops unknown keys, so
  // this import would succeed while silently discarding columns.
  it('refuses a target that is behind, naming what is missing', () => {
    const result = checkSchemaCompatibility(ledger('0001', '0002'), ['0001']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/0002/);
  });

  it('refuses when the target has no ledger at all', () => {
    expect(checkSchemaCompatibility(ledger('0001'), []).ok).toBe(false);
  });

  it('accepts an archive with an empty ledger', () => {
    // Nothing to be missing, so nothing to refuse.
    expect(checkSchemaCompatibility([], ['0001']).ok).toBe(true);
  });

  it('compares version strings rather than numbers', () => {
    // Prefixes have gaps and leading zeros; numeric comparison is unsafe.
    const result = checkSchemaCompatibility(ledger('0009', '0010'), ['0009', '0010']);
    expect(result.ok).toBe(true);
  });
});

describe('assertOrgAbsent', () => {
  it('passes for an id that does not exist', async () => {
    await withTransaction(async tx => {
      await assertOrgAbsent(tx, '4c000000-0000-4000-8000-0000000000ff');
    });
  });

  // There is no overwrite path, by design.
  it('throws for an id that already exists, naming the organization', async () => {
    await expect(withTransaction(async tx => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO public.organizations (name, org_type)
         VALUES ('Collision Probe', 'private_foundation') RETURNING id`);
      await assertOrgAbsent(tx, rows[0].id);
    })).rejects.toThrow(/Collision Probe/);
  });
});
