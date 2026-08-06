// app/api/holdings/[id]/link-charity/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireHoldingAccess } from '@/lib/api/access';
import { getOrganization, convertToCharity } from '@/lib/services/propublica';
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
 * If the charity doesn't exist locally, fetches from ProPublica and creates it.
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

    // If EIN provided, look up or create charity
    if (ein && !charity_id) {
      // Check local DB first
      const existingCharity = await repository.findCharityByEin(ein);

      if (existingCharity) {
        resolvedCharityId = existingCharity.id;
      } else {
        // Fetch from ProPublica and create locally
        const org = await getOrganization(ein);
        if (!org) {
          return json(
            { error: `No organization found with EIN ${ein}` },
            { status: 404 }
          );
        }

        const charityData = convertToCharity(org);
        if (!charityData.ein || !charityData.name) {
          return json({ error: 'Charity record is missing EIN or name' }, { status: 422 });
        }
        try {
          const newCharity = await repository.createCharity({
            ...charityData,
            ein: charityData.ein,
            name: charityData.name,
            is_active: true,
          });
          resolvedCharityId = newCharity.id;
        } catch (insertError: any) {
          if (insertError?.code !== '23505') throw insertError;
          const existing = await repository.findCharityByEin(ein);
          resolvedCharityId = existing?.id;
        }
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
    return json(
      { error: error.message || 'Failed to link charity' },
      { status: 500 }
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
