// app/api/portfolio/[id]/member-role/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// GET /api/portfolio/[id]/member-role - Get current user's role for this portfolio
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) {
    return NextResponse.json({ role: null }, { headers: cacheHeaders() });
  }
  try {
    return NextResponse.json({ role: access.context.role }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get member role' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
