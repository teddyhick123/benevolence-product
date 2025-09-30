// app/api/admin/users/lookup/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSB } from '@supabase/supabase-js';

function noStore(json: any, status = 200) {
  return NextResponse.json(json, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('email') || '';
  const email = raw.trim().toLowerCase();

  if (!email) return noStore({ error: 'email is required' }, 400);
  // light format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return noStore({ error: 'invalid email' }, 422);

  // Check admin via SSR cookie-bound client
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set: (n, v, o) => c.set({ name: n, value: v, ...o }),
        remove: (n, o) => c.delete(n),
      },
    }
  );

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) return noStore({ error: 'not authorized' }, 403);

  // Use service role to search auth.users (server-side only)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!serviceKey) return noStore({ error: 'missing service role key' }, 500);
  const admin = createSB(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return noStore({ error: error.message }, 500);

  const user = data?.users?.find((u) => (u.email || '').toLowerCase() === email) || null;
  if (!user) return noStore({ data: null });

  const u = user;
  return noStore({
    data: {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      user_metadata: u.user_metadata ?? null,
    },
  });
}