import { NextResponse } from 'next/server';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';
import { canEdit } from '@/lib/organizations/roles';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: pid } = await ctx.params;

  const access = await requirePortfolioAccess(pid);
  if (isAccessDenied(access)) return access.response;

  return NextResponse.json(
    { role: access.context.role, can_edit: canEdit(access.context.role) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
