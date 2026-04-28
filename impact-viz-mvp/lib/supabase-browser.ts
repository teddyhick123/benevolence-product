// lib/supabase-browser.ts
// Client-side Supabase client - safe to import in 'use client' components

import { createBrowserClient as createBrowserClientSSR } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components
 * Uses the public anon key for client-side authentication with RLS
 *
 * @example
 * 'use client';
 * import { createBrowserClient } from '@/lib/supabase-browser';
 * const supabase = createBrowserClient();
 */
export function createBrowserClient() {
  return createBrowserClientSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Alias for components using 'createClient' pattern
export const createClient = createBrowserClient;

// Default export for convenience
export default createBrowserClient;
