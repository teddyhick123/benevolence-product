import { createServerClient as createServerClientSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { PlatformDatabase } from '@/lib/database-client';

/** Cookie-backed Supabase session client for server code and route handlers. */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createServerClientSSR<PlatformDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}

export type SessionClient = Awaited<ReturnType<typeof createServerClient>>;
