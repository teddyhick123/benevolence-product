// app/api/admin/portfolios/[id]/members/[userId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { updateMemberRoleSchema } from '@/lib/schemas/admin';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  // Support form method override (_method=DELETE) for simple forms
  const body = await req.formData().catch(async () => {
    try { return await req.json(); } catch { return null; }
  });
  const methodOverride = typeof body?.get === 'function' ? String(body.get('_method') || '') : (body as any)?._method;
  if ((req.method === 'POST' && methodOverride?.toUpperCase() === 'DELETE') || req.method === 'DELETE') {
    return DELETE(req, ctx);
  }
  return NextResponse.json({ error: 'Unsupported method' }, { status: 405 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const { id: portfolioId, userId } = await ctx.params;

  const supabase = await createSupabaseServerClient();

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });

  let callerRole: 'viewer'|'member'|'owner'|'admin' = 'viewer';
  if (isAdmin) {
    callerRole = 'admin';
  } else {
    const { data: roleRow, error: roleErr } = await supabase.rpc('role_for_portfolio', { p_portfolio_id: portfolioId });
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
    callerRole = (roleRow as any) ?? 'viewer';
  }

  // Prevent removing the last owner
  const { data: targetMember, error: targetErr } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });

  // Owners can only remove non-owners
  if (callerRole !== 'admin') {
    if (callerRole !== 'owner') {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
    if (targetMember?.role === 'owner') {
      return NextResponse.json({ error: 'owners cannot remove other owners' }, { status: 403 });
    }
  }

  if (targetMember?.role === 'owner') {
    const { data: ownerCount, error: ownerCountErr } = await supabase.rpc('owner_count_for_portfolio', { p_portfolio_id: portfolioId });
    if (ownerCountErr) return NextResponse.json({ error: ownerCountErr.message }, { status: 500 });
    if ((ownerCount as number) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last owner from this portfolio.' }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const { id: portfolioId, userId } = await ctx.params;

  // Accept either JSON or form body
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      return { role: String(fd.get('role') || '') };
    }
    return {};
  });

  // Validate with Zod
  const validation = updateMemberRoleSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { role } = validation.data;

  const supabase = await createSupabaseServerClient();

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });

  let callerRole: 'viewer'|'member'|'owner'|'admin' = 'viewer';
  if (isAdmin) {
    callerRole = 'admin';
  } else {
    const { data: roleRow, error: roleErr } = await supabase.rpc('role_for_portfolio', { p_portfolio_id: portfolioId });
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
    callerRole = (roleRow as any) ?? 'viewer';
  }

  // Owners can only set non-owner operational roles. App admins can set any role.
  if (callerRole !== 'admin') {
    if (callerRole !== 'owner') {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
    if (role === 'owner') {
      return NextResponse.json({ error: 'owners cannot assign owner role' }, { status: 403 });
    }
  }

  const { data: currentMember, error: currErr } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId)
    .maybeSingle();
  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });

  // Non-admin owners cannot change roles of owners
  if (callerRole === 'owner' && currentMember?.role === 'owner') {
    return NextResponse.json({ error: 'owners cannot change roles of other owners' }, { status: 403 });
  }

  // Prevent demoting the last owner
  if (currentMember?.role === 'owner' && role !== 'owner') {
    const { data: ownerCount, error: ownerCountErr } = await supabase.rpc('owner_count_for_portfolio', { p_portfolio_id: portfolioId });
    if (ownerCountErr) return NextResponse.json({ error: ownerCountErr.message }, { status: 500 });
    if ((ownerCount as number) <= 1) {
      return NextResponse.json({ error: 'Cannot demote the last owner.' }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from('portfolio_members')
    .update({ role })
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
