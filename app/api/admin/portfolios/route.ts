// app/api/admin/portfolios/route.ts
import { NextResponse } from 'next/server';
import { createAdminPortfolioSchema } from '@/lib/schemas/admin';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';

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

  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  // If owner_email is provided (and no owner_user_id), look up the user via profiles table
  if (!owner_user_id && owner_email) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', owner_email)
        .maybeSingle();

      if (profile?.id) {
        owner_user_id = profile.id;
      }
    } catch (e) {
      // Owner email lookup failed, will proceed without owner assignment
    }
  }

  owner_user_id ??= access.context.user.id;
  const { data: ownerMembership, error: membershipError } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', owner_user_id)
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }
  if (!ownerMembership) {
    return NextResponse.json(
      { error: 'Portfolio owner must be an accepted organization member' },
      { status: 400 }
    );
  }

  // Create the canonical organization-scoped portfolio.
  const { data: inserted, error: insErr } = await supabase
    .from('portfolios')
    .insert({
      name,
      org_id: ownerMembership.org_id,
      owner_id: owner_user_id,
      settings: { base_currency },
    })
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
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  const { data, error } = await access.context.db
    .from('portfolios')
    .select('id, name, settings')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    data: (data ?? []).map(portfolio => ({
      id: portfolio.id,
      name: portfolio.name,
      base_currency: portfolio.settings?.base_currency ?? 'USD',
    })),
  });
}
