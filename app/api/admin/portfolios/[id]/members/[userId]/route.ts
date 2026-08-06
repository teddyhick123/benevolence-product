// app/api/admin/portfolios/[id]/members/[userId]/route.ts
import { NextResponse } from 'next/server';
import { updateMemberRoleSchema } from '@/lib/schemas/admin';
import { isAccessDenied, requirePortfolioManagerOrAppAdmin } from '@/lib/api/access';
import { createPortfolioMembershipRepository } from '@/lib/api/repositories/portfolio-memberships';

function membershipError(error: unknown, fallback: string) {
  const dbError = error as { code?: string; message?: string };
  const status = dbError.code === '42501' ? 403
    : dbError.code === 'P0002' ? 404
      : dbError.code === '23514' || dbError.code === '22023' ? 400
        : 500;
  const message = status === 500 ? fallback : (dbError.message || fallback);
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  // Support form method override (_method=DELETE) for simple forms
  const body = await req.formData().catch(async () => {
    try { return await req.json(); } catch { return null; }
  });
  const methodOverride = typeof body?.get === 'function' ? String(body.get('_method') || '') : (body as any)?._method;
  if ((req.method === 'POST' && methodOverride?.toUpperCase() === 'DELETE') || req.method === 'DELETE') {
    return DELETE(req, ctx);
  }
  return NextResponse.json({ error: 'Unsupported method' }, { status: 405 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const { id: portfolioId, userId } = await ctx.params;

  const access = await requirePortfolioManagerOrAppAdmin(portfolioId);
  if (isAccessDenied(access)) return access.response;
  try {
    await createPortfolioMembershipRepository(access.context).remove(userId);
  } catch (error) {
    return membershipError(error, 'Failed to remove portfolio member');
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const { id: portfolioId, userId } = await ctx.params;

  // Accept either JSON or form body
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      return { role: String(fd.get('role') || '') };
    }
    return {};
  });

  // Validate with Zod
  const validation = updateMemberRoleSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { role } = validation.data;

  const access = await requirePortfolioManagerOrAppAdmin(portfolioId);
  if (isAccessDenied(access)) return access.response;
  try {
    await createPortfolioMembershipRepository(access.context).updateRole(userId, role);
  } catch (error) {
    return membershipError(error, 'Failed to update portfolio member');
  }
  return NextResponse.json({ ok: true });
}
