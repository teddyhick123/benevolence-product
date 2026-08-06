// app/api/holdings/[id]/link-charity/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireHoldingAccess } from '@/lib/api/access';
import { createHoldingCharityRepository } from '@/lib/api/repositories/holding-charities';

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /api/holdings/[id]/link-charity
 * Link a holding to a charity by EIN or charity_id.
 * The charity must already exist in the canonical, administratively managed catalog.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const access = await requireHoldingAccess(holdingId, 'member');
  if (isAccessDenied(access)) return access.response;
  const repository = createHoldingCharityRepository(access.context);

  try {
    const body = await req.json();
    const { ein, charity_id } = body;

    if (!ein && !charity_id) {
      return json(
        { error: 'Either ein or charity_id is required' },
        { status: 400 }
      );
    }

    let resolvedCharityId = charity_id;

    // Global catalog ingestion is an administrative concern. This member route
    // may link only an existing canonical charity.
    if (ein && !charity_id) {
      const existingCharity = await repository.findCharityByEin(ein);

      if (existingCharity) {
        resolvedCharityId = existingCharity.id;
      } else {
        return json(
          { error: `Charity ${ein} is not available in the canonical catalog` },
          { status: 404 }
        );
      }
    }

    if (!resolvedCharityId) {
      return json(
        { error: 'Could not resolve charity' },
        { status: 400 }
      );
    }

    const { holding: updatedHolding, charity } = await repository.link(resolvedCharityId);

    return json({
      holding: updatedHolding,
      charity,
    });
  } catch (error: any) {
    const status = error?.code === '23505' ? 409
      : error?.code === 'P0002' ? 404
        : error?.code === '42501' ? 403
          : 500;
    return json(
      { error: status === 500 ? 'Failed to link charity' : error.message },
      { status }
    );
  }
}

/**
 * DELETE /api/holdings/[id]/link-charity
 * Unlink a holding from its charity
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const access = await requireHoldingAccess(holdingId, 'member');
  if (isAccessDenied(access)) return access.response;
  const repository = createHoldingCharityRepository(access.context);

  try {
    await repository.unlink();

    return json({ success: true });
  } catch (error: any) {
    return json(
      { error: error.message || 'Failed to unlink charity' },
      { status: 500 }
    );
  }
}
