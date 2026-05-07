/**
 * Shared admin authorization helper.
 * Returns the user's UUID if they are a super-admin, or null otherwise.
 * Uses the is_admin() RPC (backed by the admins table).
 */

import { createServerClient } from '@/lib/supabase';

export async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  return isAdmin ? user.id : null;
}
