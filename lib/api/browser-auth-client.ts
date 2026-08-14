import { createBrowserClient as createBrowserClientSSR } from '@supabase/ssr';
import type { PlatformDatabase } from '@/lib/database-client';

/**
 * Creates the browser-only Supabase client used exclusively for auth/session
 * lifecycle behavior. Domain data flows through guarded APIs and domain hooks.
 */
export function createBrowserAuthClient() {
  return createBrowserClientSSR<PlatformDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
