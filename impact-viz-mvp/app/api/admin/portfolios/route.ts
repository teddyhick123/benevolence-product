// app/api/admin/portfolios/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name || '').trim();
  const base_currency = (body?.base_currency || 'USD').trim().toUpperCase();
  let owner_user_id = (body?.owner_user_id || '').trim();
  const owner_email = (body?.owner_email || '').trim().toLowerCase();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Must be admin
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  // If owner_email is provided (and no owner_user_id), look up the user via Supabase Admin API
  if (!owner_user_id && owner_email) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      if (!url || !serviceKey) {
        console.warn('Missing SUPABASE service credentials; skipping owner email lookup');
      } else {
        const admin = createClient(url, serviceKey);
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email: owner_email });
        if (error) {
          console.warn('Owner email lookup failed:', error.message);
        } else {
          owner_user_id = data?.users?.[0]?.id || '';
        }
      }
    } catch (e) {
      console.warn('Owner email lookup exception:', e);
    }
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

  if (owner_email && !owner_user_id) {
    return NextResponse.json({ id: inserted.id, warning: `portfolio created, but no user found for owner_email: ${owner_email}` });
  }

  return NextResponse.json({ id: inserted.id });
}

// (Optional) GET: list portfolios with member count (admin only)
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const { data, error } = await supabase
    .from('portfolios')
    .select('id, name, base_currency')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}