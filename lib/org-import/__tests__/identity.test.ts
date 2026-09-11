// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { restoreAccounts } from '@/lib/org-import/identity';
import { withTransaction, type Tx } from '@/lib/org-import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const ID = '4c000000-0000-4000-8000-00000000aaaa';
const profile = (id: string, email: string | null) => JSON.stringify({ id, email });

/**
 * Runs assertions inside a transaction that always rolls back, so nothing
 * these tests create survives into the next run.
 */
async function inRollback(fn: (_tx: Tx) => Promise<void>): Promise<void> {
  const marker = 'intentional-rollback';
  await withTransaction(async tx => {
    await fn(tx);
    throw new Error(marker);
  }).catch((err: Error) => { if (err.message !== marker) throw err; });
}

describe('restoreAccounts', () => {
  it('creates an account with the id the archive recorded', async () => {
    await inRollback(async tx => {
      const created = await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      expect(created).toBe(1);

      const { rows } = await tx.query<{ email: string }>(
        'SELECT email FROM auth.users WHERE id = $1', [ID]);
      expect(rows[0].email).toBe('restored@example.com');
    });
  });

  // "No usable password" is a security claim and must be checked, not assumed.
  it('leaves the account with no usable password', async () => {
    await inRollback(async tx => {
      await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      const { rows } = await tx.query<{ pw: string | null }>(
        'SELECT encrypted_password AS pw FROM auth.users WHERE id = $1', [ID]);
      // An empty string is not a valid bcrypt hash, so no password can match.
      expect(rows[0].pw === '' || rows[0].pw === null).toBe(true);
    });
  });

  it('skips an account that already exists rather than failing', async () => {
    await inRollback(async tx => {
      await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      const again = await restoreAccounts(tx, [profile(ID, 'restored@example.com')]);
      expect(again).toBe(0);
    });
  });

  it('skips a profile with no email rather than creating an unusable account', async () => {
    await inRollback(async tx => {
      const created = await restoreAccounts(tx, [profile(ID, null)]);
      expect(created).toBe(0);
    });
  });

  it('creates every account in one archive', async () => {
    await inRollback(async tx => {
      const created = await restoreAccounts(tx, [
        profile('4c000000-0000-4000-8000-00000000ab01', 'a@example.com'),
        profile('4c000000-0000-4000-8000-00000000ab02', 'b@example.com'),
      ]);
      expect(created).toBe(2);
    });
  });
});
