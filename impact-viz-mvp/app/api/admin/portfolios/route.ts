

// app/api/admin/portfolios/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name || '').trim();
  const base_currency = (body?.base_currency || 'USD').trim().toUpperCase();
  const owner_user_id = (body?.owner_user_id || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => c.get(n)?.value,
        set: (n: string, v: string, o: any) => c.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => c.set({ name: n, value: '', ...o }),
      },
    }
  );

  // Must be admin
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  // Create the portfolio
  const { data: inserted, error: insErr } = await supabase
    .from('portfolios')
    .insert({ name, base_currency })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: insErr?.message || 'failed to create portfolio' }, { status: 500 });
  }

  // Optionally add the owner membership
  if (owner_user_id) {
    const { error: memErr } = await supabase
      .from('portfolio_members')
      .upsert({ user_id: owner_user_id, portfolio_id: inserted.id, role: 'owner' }, { onConflict: 'user_id,portfolio_id' });

    if (memErr) {
      // We still return 200 with the portfolio id, but include the membership error
      return NextResponse.json({ id: inserted.id, warning: `portfolio created, but failed to add owner: ${memErr.message}` });
    }
  }

  return NextResponse.json({ id: inserted.id });
}

// (Optional) GET: list portfolios with member count (admin only)
export async function GET() {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => c.get(n)?.value,
        set: (n: string, v: string, o: any) => c.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => c.set({ name, value: '', ...o }),
      },
    }
  );

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const { data, error } = await supabase
    .from('portfolios')
    .select('id, name, base_currency')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}