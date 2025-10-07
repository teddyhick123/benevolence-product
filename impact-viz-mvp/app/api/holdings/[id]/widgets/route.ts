import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holding_id } = await ctx.params;
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const sb = await createSb();

  const { data, count, error } = await sb
    .from('holding_widgets')
    .select('id, holding_id, type, title, config, position', { count: 'exact' })
    .eq('holding_id', holding_id)
    .order('position', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
  }, { headers: cacheHeaders() });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holding_id } = await ctx.params;
  const sb = await createSb();

  // Check if user can edit this holding
  const { data: holding } = await sb
    .from('holdings')
    .select('portfolio_id')
    .eq('id', holding_id)
    .single();

  if (!holding) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404, headers: cacheHeaders() });
  }

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: holding.portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400, headers: cacheHeaders() });
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : null;

  // parse config (JSON) safely
  let config: any = null;
  if (body?.config !== undefined) {
    try {
      config = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;
    } catch {
      return NextResponse.json({ error: 'config must be valid JSON' }, { status: 400, headers: cacheHeaders() });
    }
  }

  // Determine next position
  let nextPos = 1;
  {
    const { data: posRows, error: posErr } = await sb
      .from('holding_widgets')
      .select('position')
      .eq('holding_id', holding_id)
      .order('position', { ascending: false })
      .limit(1);
    if (!posErr && posRows && posRows.length > 0 && Number.isFinite(Number(posRows[0]?.position))) {
      nextPos = Number(posRows[0].position) + 1;
    }
  }

  const insertRow: any = { holding_id, type, title, config, position: nextPos };

  const { data: inserted, error: insErr } = await sb
    .from('holding_widgets')
    .insert(insertRow)
    .select('id, holding_id, type, title, config, position')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data: inserted }, { headers: cacheHeaders() });
}
