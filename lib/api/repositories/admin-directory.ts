import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext } from '@/lib/api/principals';

/** Elevated auth-directory lookup constrained to an authorized app admin. */
export function createAppAdminDirectoryRepository(_scope: AppAdminAccessContext) {
  const db = createElevatedClient();

  return {
    async findUserByEmail(email: string) {
      const normalizedEmail = email.toLowerCase();
      const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;

      const user = data.users.find(
        candidate => candidate.email?.toLowerCase() === normalizedEmail
      );
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.user_metadata ?? null,
      };
    },
  };
}
