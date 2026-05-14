// app/api/admin/portfolios/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createAdminPortfolioSchema } from '@/lib/schemas/admin';

export async function POST(req: Request) {
  // Parse and validate request body
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = createAdminPortfolioSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { name, base_currency, owner_user_id: initialOwnerId, owner_email } = validation.data;
  let owner_user_id = initialOwnerId;

  const supabase = await createSupabaseServerClient();

  // Must be admin
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  // If owner_email is provided (and no owner_user_id), look up the user via profiles table
  if (!owner_user_id && owner_email) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', owner_email)
        .maybeSingle();

      if (profile?.user_id) {
        owner_user_id = profile.user_id;
      }
    } catch (e) {
      // Owner email lookup failed, will proceed without owner assignment
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

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr || !isAdmin) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const { data, error } = await supabase
    .from('portfolios')
    .select('id, name, base_currency')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}