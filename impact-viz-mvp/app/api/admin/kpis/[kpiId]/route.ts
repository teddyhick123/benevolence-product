// app/api/admin/kpis/[kpiId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { adminUpdateKpiSchema } from '@/lib/schemas/admin';

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || !isAdmin) return { supabase: null as any, error: 'not authorized' };
  return { supabase, error: null };
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

  // Build object for validation
  const body: any = {};
  if (get('metric_code') != null) body.metric_code = String(get('metric_code') || '').trim();
  if (get('display_name') != null) body.display_name = String(get('display_name') || '');
  if (get('target_value') != null) body.target_value = toNumber(get('target_value'));
  if (get('target_date') != null) body.target_date = get('target_date') ? String(get('target_date')) : null;
  if (get('order_index') != null) body.order_index = toNumber(get('order_index'));

  // Validate with Zod
  const validation = adminUpdateKpiSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const fields = validation.data;

  const { supabase, error: adminErr } = await requireAdmin();
  if (adminErr) return NextResponse.json({ error: adminErr }, { status: 403 });

  const { error } = await supabase.from('kpi_definitions').update(fields).eq('id', kpiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If coming from a form, redirect back to the referer or to the KPIs page
  const referer = (typeof (parsed as any)?.get === 'function') ? ( (parsed as FormData).get('__referer') as string | null) : null;
  if (referer) return NextResponse.redirect(new URL(referer, req.url));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ kpiId: string }> }) {
  const { kpiId } = await ctx.params;
  const { supabase, error: adminErr } = await requireAdmin();
  if (adminErr) return NextResponse.json({ error: adminErr }, { status: 403 });

  const { error } = await supabase.from('kpi_definitions').delete().eq('id', kpiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}