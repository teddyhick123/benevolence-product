

// app/api/portfolio/[id]/widgets/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createWidgetSchema } from '@/lib/schemas/portfolio';
import { validateRequest } from '@/lib/validation';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;

  const url = new URL(req.url);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const sb = await createSb();

  const { data, count, error } = await sb
    .from('widgets')
    .select('id, portfolio_id, type, title, config, position', { count: 'exact' })
    .eq('portfolio_id', portfolio_id)
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
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission gate (friendlier than opaque RLS errors)
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Validate request body
  const validation = await validateRequest(req, createWidgetSchema);
  if (!validation.success) {
    return validation.response;
  }

  const { type, title, config } = validation.data;

  // Determine next position (max(position) + 1)
  let nextPos = 1;
  {
    const { data: posRows, error: posErr } = await sb
      .from('widgets')
      .select('position')
      .eq('portfolio_id', portfolio_id)
      .order('position', { ascending: false })
      .limit(1);
    if (!posErr && posRows && posRows.length > 0 && Number.isFinite(Number(posRows[0]?.position))) {
      nextPos = Number(posRows[0].position) + 1;
    }
  }

  const insertRow: any = {
    portfolio_id,
    type,
    title: title ?? null,
    config: config ?? null,
    position: nextPos
  };

  const { data: inserted, error: insErr } = await sb
    .from('widgets')
    .insert(insertRow)
    .select('id, portfolio_id, type, title, config, position')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data: inserted }, { headers: cacheHeaders() });
}
