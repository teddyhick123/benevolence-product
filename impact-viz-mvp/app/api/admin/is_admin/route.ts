// app/api/admin/is_admin/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set: (n, v, o) => c.set({ name: n, value: v, ...o }),
        remove: (n, o) => c.set({ name: n, value: '', ...o }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ is_admin: false }, { headers: { 'Cache-Control': 'no-store' } });

  const { data: isAdmin } = await supabase.rpc('is_admin');
  return NextResponse.json({ is_admin: !!isAdmin }, { headers: { 'Cache-Control': 'no-store' } });
}