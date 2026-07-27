import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Internal elevated-client constructor. It bypasses RLS and must only be used
 * by tenant/principal-scoped repositories under lib/api/.
 */
export function createElevatedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export type ElevatedClient = ReturnType<typeof createElevatedClient>;
