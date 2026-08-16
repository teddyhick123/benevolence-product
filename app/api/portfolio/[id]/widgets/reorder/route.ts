// app/api/portfolio/[id]/widgets/reorder/route.ts
//
// Swapping two widgets used to be three separate PATCH requests through a
// sentinel position, so a failure between them left a widget stranded outside
// the real ordering. The swap now happens in one transaction.
import { NextResponse } from 'next/server';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) return access.response;

  const body = await req.json().catch(() => ({}));
  const { widget_a, widget_b } = body as { widget_a?: string; widget_b?: string };

  if (!widget_a || !widget_b || !UUID.test(widget_a) || !UUID.test(widget_b)) {
    return NextResponse.json(
      { error: 'widget_a and widget_b must be widget ids' },
      { status: 400, headers: cacheHeaders() }
    );
  }
  if (widget_a === widget_b) {
    return NextResponse.json(
      { error: 'Cannot swap a widget with itself' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  const { data, error } = await access.context.db.rpc('swap_portfolio_widget_positions', {
    p_portfolio_id: portfolio_id,
    p_widget_a: widget_a,
    p_widget_b: widget_b,
  });

  if (error) {
    const status = error.code === 'P0002' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status, headers: cacheHeaders() });
  }

  return NextResponse.json({ data: data ?? [] }, { headers: cacheHeaders() });
}
