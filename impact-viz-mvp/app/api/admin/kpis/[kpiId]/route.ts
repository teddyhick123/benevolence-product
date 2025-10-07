// app/api/admin/kpis/[kpiId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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
    try { return await req.json(); } catch { return null; }
  });

  const get = (k: string) =>
    typeof (parsed as any)?.get === 'function' ? (parsed as FormData).get(k) : (parsed as any)?.[k];

  const fields: any = {};
  if (get('metric_code') != null) fields.metric_code = String(get('metric_code') || '').trim();
  if (get('display_name') != null) fields.display_name = String(get('display_name') || '') || null;
  if (get('target_value') != null) fields.target_value = toNumber(get('target_value'));
  if (get('target_date') != null) fields.target_date = (get('target_date') ? String(get('target_date')) : null);
  if (get('order_index') != null) fields.order_index = toNumber(get('order_index')) ?? 0;

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