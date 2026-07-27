// lib/supabase.ts
// Server-side Supabase client configuration
//
// For CLIENT components, use:
//   import { createBrowserClient } from '@/lib/supabase-browser';
//
// New API routes should use the typed guards and scoped repositories under
// '@/lib/api'. The exports in this file remain as migration compatibility for
// existing server components, services, and unmigrated route families.

import { createBrowserClient } from './supabase-browser';
import { createServerClient } from './api/server-client';
import { createElevatedClient } from './api/admin-client';

export { createServerClient };

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
  return createElevatedClient();
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
