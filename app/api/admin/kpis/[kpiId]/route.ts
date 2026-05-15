// app/api/admin/kpis/[kpiId]/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { adminUpdateKpiSchema } from '@/lib/schemas/admin';

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Method override support via form POST
export async function POST(req: Request, ctx: { params: Promise<{ kpiId: string }> }) {
  const body = await req.formData().catch(async () => {
    try { return await req.json(); } catch { return null; }
  });
  const methodOverride =
    typeof (body as any)?.get === 'function' ? String((body as FormData).get('_method') || '') : (body as any)?._method;

  if (methodOverride?.toUpperCase() === 'PUT') return PUT(req, ctx);
  if (methodOverride?.toUpperCase() === 'DELETE') return DELETE(req, ctx);
  return NextResponse.json({ error: 'Unsupported method' }, { status: 405 });
}

export async function PUT(req: Request, ctx: { params: Promise<{ kpiId: string }> }) {
  const { kpiId } = await ctx.params;
  const parsed = await req.formData().catch(async () => {
    try { return await req.json(); } catch { return {}; }
  });

  const get = (k: string) =>
    typeof (parsed as any)?.get === 'function' ? (parsed as FormData).get(k) : (parsed as any)?.[k];

  const body: any = {};
  if (get('slug') != null) body.slug = String(get('slug') || '').trim();
  if (get('name') != null) body.name = String(get('name') || '');
  if (get('target_value') != null) body.target_value = toNumber(get('target_value'));
  if (get('display_order') != null) body.display_order = toNumber(get('display_order'));

  const validation = adminUpdateKpiSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.format() },
      { status: 400 }
    );
  }

  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  const supabase = await createServerClient();

  const { error } = await supabase.from('kpi_definitions').update(validation.data).eq('id', kpiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const referer = (typeof (parsed as any)?.get === 'function') ? ((parsed as FormData).get('__referer') as string | null) : null;
  if (referer) return NextResponse.redirect(new URL(referer, req.url));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ kpiId: string }> }) {
  const { kpiId } = await ctx.params;
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  const supabase = await createServerClient();

  const { error } = await supabase.from('kpi_definitions').delete().eq('id', kpiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
