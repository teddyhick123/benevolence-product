// app/api/admin/portfolios/[id]/members/[userId]/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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
    return null;
  });

  const role = String((parsed as any)?.role || '').trim();
  if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 });

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

  const { error } = await supabase
    .from('portfolio_members')
    .update({ role })
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });