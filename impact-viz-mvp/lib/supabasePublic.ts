// lib/supabasePublic.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// If your project uses a generated Database type, you can do:
// import type { Database } from '@/types/supabase';

export async function supabasePublic() {
  // In Next 14/15 dynamic routes, cookies() is async-like; awaiting is safest.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // ✅ New SSR cookie API: use getAll/setAll
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