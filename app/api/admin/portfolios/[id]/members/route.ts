// app/api/admin/portfolios/[id]/members/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { addPortfolioMemberSchema } from '@/lib/schemas/admin';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;

  // Accept either JSON or form body
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      return {
        user_id: String(fd.get('user_id') || ''),
        role: String(fd.get('role') || 'viewer'),
      };
    }
    return {};
  });

  // Validate with Zod
  const validation = addPortfolioMemberSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { user_id: userId, role } = validation.data;

  const supabase = await createSupabaseServerClient();

  // Check if caller is admin
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr) {
    return NextResponse.json({ error: adminErr.message }, { status: 500 });
  }

  let callerRole: 'viewer' | 'editor' | 'owner' | 'admin' = 'viewer';
  if (isAdmin) {
    callerRole = 'admin';
  } else {
    const { data: roleRow, error: roleErr } = await supabase.rpc('role_for_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 500 });
    }
    callerRole = (roleRow as any) ?? 'viewer';
  }

  // Only admins and owners can add members
  if (callerRole !== 'admin' && callerRole !== 'owner') {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  // Non-admin owners cannot add owners
  if (callerRole === 'owner' && role === 'owner') {
    return NextResponse.json({ error: 'owners cannot assign owner role' }, { status: 403 });
  }

  // Use service role client to bypass RLS for profile operations
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Ensure the user exists in profiles table (bypass RLS)
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  if (!profile) {
    // Create a profile entry for this user if it doesn't exist
    const { error: insertProfileErr } = await adminClient
      .from('profiles')
      .insert({ user_id: userId });

    if (insertProfileErr) {
      return NextResponse.json(
        { error: `User not found and could not create profile: ${insertProfileErr.message}` },
        { status: 400 }
      );
    }
  }

  // Insert the portfolio member
  const { error: insertErr } = await supabase
    .from('portfolio_members')
    .insert({
      portfolio_id: portfolioId,
      user_id: userId,
      role,
    });

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Unique constraint violation - user is already a member
      return NextResponse.json({ error: 'User is already a member of this portfolio' }, { status: 400 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Redirect back to the members page
  return NextResponse.redirect(new URL(`/admin/portfolios/${portfolioId}/members`, req.url));
}
