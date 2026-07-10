/**
 * Shared admin authorization helper.
 * Returns the user's UUID if they are an internal app admin, or null otherwise.
 * Uses the canonical is_app_admin() RPC.
 */

import { createServerClient } from '@/lib/supabase';

export async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_app_admin');
  return isAdmin ? user.id : null;
}
