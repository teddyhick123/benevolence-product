

// app/api/portfolio/[id]/widgets/route.ts
import { NextResponse } from 'next/server';
import { createWidgetSchema } from '@/lib/schemas/portfolio';
import { validateRequest } from '@/lib/validation';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;

  const url = new URL(req.url);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const sb = access.context.db;

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
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) return access.response;
  const sb = access.context.db;

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
