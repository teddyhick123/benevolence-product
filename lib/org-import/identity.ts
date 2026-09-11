// lib/org-import/identity.ts
// Recreates the accounts an archive's rows point at.
//
// Credentials are never exported, so these accounts have no usable password.
// Each person regains access through the normal password-reset flow. Without
// them the import produces an organization nobody can access: 21 NOT NULL
// foreign keys point at auth.users, including organization_members.user_id
// and portfolios.owner_id.

import type { Tx } from '@/lib/org-import/connection';

const SUPABASE_DEFAULT_INSTANCE = '00000000-0000-0000-0000-000000000000';

export async function restoreAccounts(tx: Tx, profileLines: string[]): Promise<number> {
  let created = 0;

  for (const line of profileLines) {
    const profile = JSON.parse(line) as { id?: string; email?: string | null };
    // A profile with no email cannot become a usable account, and an account
    // nobody can reset into is worse than an absent one.
    if (!profile.id || !profile.email) continue;

    const { rowCount } = await tx.query(
      `INSERT INTO auth.users
         (id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, 'authenticated', 'authenticated', $3, '', now(), now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [profile.id, SUPABASE_DEFAULT_INSTANCE, profile.email],
    );
    created += rowCount;
  }

  return created;
}
