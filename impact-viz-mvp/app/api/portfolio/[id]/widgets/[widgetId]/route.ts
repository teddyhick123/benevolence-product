

// app/api/portfolio/[id]/widgets/[widgetId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; widgetId: string }> }) {
  const { id: portfolio_id, widgetId } = await ctx.params;
  const sb = await createSb();

  // Permission gate
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const patch: Record<string, any> = {};
  if (typeof body?.type === 'string') patch.type = body.type.trim() || null;
  if (typeof body?.title === 'string') patch.title = body.title.trim() || null;

  if (body?.config !== undefined) {
    try {
      patch.config = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;
    } catch {
      return NextResponse.json({ error: 'config must be valid JSON' }, { status: 400, headers: cacheHeaders() });
    }
  }

  if (body?.position !== undefined) {
    const n = Number(body.position);
    if (Number.isFinite(n)) patch.position = n;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data, error } = await sb
    .from('widgets')
    .update(patch)
    .eq('id', widgetId)
    .eq('portfolio_id', portfolio_id)
    .select('id, portfolio_id, type, title, config, position')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; widgetId: string }> }) {
  const { id: portfolio_id, widgetId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('widgets')
    .delete()
    .eq('id', widgetId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}