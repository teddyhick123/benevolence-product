// lib/supabase.ts
// Unified Supabase client configuration
// Consolidates: supabaseClient.ts, supabasePublic.ts, supabaseServer.ts, supabase-server.ts

import {
  createBrowserClient as createBrowserClientSSR,
  createServerClient as createServerClientSSR
} from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for use in Client Components
 * Uses the public anon key for client-side authentication with RLS
 *
 * @example
 * 'use client';
 * import { createBrowserClient } from '@/lib/supabase';
 * const supabase = createBrowserClient();
 */
export function createBrowserClient() {
  return createBrowserClientSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Creates a Supabase client for use in Server Components, Route Handlers, and Server Actions
 * Uses the public anon key with cookie-based session management
 * Respects Row Level Security (RLS) policies
 *
 * This is the recommended client for most server-side operations
 *
 * @example
 * import { createServerClient } from '@/lib/supabase';
 * const supabase = await createServerClient();
 * const { data } = await supabase.from('portfolios').select('*');
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createServerClientSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client with service role key
 * ⚠️ BYPASSES Row Level Security (RLS) - use with extreme caution!
 *
 * Only use for admin operations that require elevated privileges:
 * - System-level operations
 * - Batch updates
 * - Admin dashboards
 *
 * @example
 * import { createAdminClient } from '@/lib/supabase';
 * const supabase = createAdminClient();
 * const { data } = await supabase.from('portfolios').select('*'); // Bypasses RLS
 */
export function createAdminClient() {
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

// ============================================================================
// Legacy exports for backward compatibility
// These will be deprecated and removed in a future version
// ============================================================================

/**
 * @deprecated Use createServerClient() instead
 * Legacy export from lib/supabasePublic.ts
 */
export const supabasePublic = createServerClient;

/**
 * @deprecated Use createServerClient() instead
 * Legacy export from lib/supabase-server.ts
 */
export const createSupabaseServerClient = createServerClient;

/**
 * @deprecated Use createAdminClient() instead
 * Legacy export from lib/supabaseServer.ts
 */
export const supabaseServer = createAdminClient;

/**
 * @deprecated Use createBrowserClient() instead
 * Legacy export from lib/supabaseClient.ts
 */
export const supabase = createBrowserClient;
