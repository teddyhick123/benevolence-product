// app/api/holdings/[id]/link-charity/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireHoldingAccess } from '@/lib/api/access';
import { getOrganization, convertToCharity } from '@/lib/services/propublica';

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
  const sb = access.context.db;

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
      const { data: existingCharity } = await sb
        .from('charities')
        .select('id')
        .eq('ein', ein)
        .maybeSingle();

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
        const { data: newCharity, error: insertError } = await sb
          .from('charities')
          .insert({
            ...charityData,
            is_active: true,
          })
          .select('id')
          .single();

        if (insertError) {
          // If duplicate EIN error, try to fetch existing
          if (insertError.code === '23505') {
            const { data: existing } = await sb
              .from('charities')
              .select('id')
              .eq('ein', ein)
              .maybeSingle();
            resolvedCharityId = existing?.id;
          } else {
            throw insertError;
          }
        } else {
          resolvedCharityId = newCharity.id;
        }
      }
    }

    if (!resolvedCharityId) {
      return json(
        { error: 'Could not resolve charity' },
        { status: 400 }
      );
    }

    // Update the holding with the charity_id
    const { data: updatedHolding, error: updateError } = await sb
      .from('holdings')
      .update({ charity_id: resolvedCharityId })
      .eq('id', holdingId)
      .select('id, name, charity_id')
      .single();

    if (updateError) throw updateError;

    // Fetch the linked charity details
    const { data: charity, error: charityError } = await sb
      .from('charities')
      .select('id, ein, name, sector, city, state, annual_revenue, annual_expenses, assets, program_expense_ratio, mission_statement')
      .eq('id', resolvedCharityId)
      .single();
    if (charityError) throw charityError;

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
  const sb = access.context.db;

  try {
    const { error } = await sb
      .from('holdings')
      .update({ charity_id: null })
      .eq('id', holdingId);

    if (error) throw error;

    return json({ success: true });
  } catch (error: any) {
    return json(
      { error: error.message || 'Failed to unlink charity' },
      { status: 500 }
    );
  }
}
