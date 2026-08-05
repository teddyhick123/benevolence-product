// app/api/admin/portfolios/[id]/members/route.ts
import { NextResponse } from 'next/server';
import { addPortfolioMemberSchema } from '@/lib/schemas/admin';
import { isAccessDenied, requirePortfolioManagerOrAppAdmin } from '@/lib/api/access';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;

  // Accept either JSON or form body
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      return {
        user_id: String(fd.get('user_id') || ''),
        role: String(fd.get('role') || 'viewer'),
      };
    }
    return {};
  });

  // Validate with Zod
  const validation = addPortfolioMemberSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { user_id: userId, role } = validation.data;

  const access = await requirePortfolioManagerOrAppAdmin(portfolioId);
  if (isAccessDenied(access)) return access.response;

  // Portfolio admins cannot grant ownership; owners and app admins can.
  if (!access.context.isAppAdmin && access.context.role !== 'owner' && role === 'owner') {
    return NextResponse.json({ error: 'Only owners can assign owner role' }, { status: 403 });
  }

  // Insert the portfolio member
  const { error: insertErr } = await access.context.db
    .from('portfolio_members')
    .insert({
      portfolio_id: portfolioId,
      user_id: userId,
      role,
    });

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Unique constraint violation - user is already a member
      return NextResponse.json({ error: 'User is already a member of this portfolio' }, { status: 400 });
    }
    if (insertErr.code === '23503') {
      return NextResponse.json(
        { error: 'User must be an accepted member of the portfolio organization first' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Redirect back to the members page
  return NextResponse.redirect(new URL(`/admin/portfolios/${portfolioId}/members`, req.url));
}
