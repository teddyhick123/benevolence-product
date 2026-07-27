import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePortfolioAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { SessionClient } from '@/lib/api/server-client';

export const runtime = 'nodejs';

type Params = { id: string; grantId: string };

const createBudgetItemSchema = z.object({
  category: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  budgeted_amount: z.coerce.number().finite().nonnegative(),
}).strict();

const updateBudgetItemSchema = z.object({
  category: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  budgeted_amount: z.coerce.number().finite().nonnegative().optional(),
  actual_amount: z.coerce.number().finite().nonnegative().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

async function requireGrantInPortfolio(
  sb: SessionClient,
  grantId: string,
  portfolioId: string
) {
  const { data, error } = await sb
    .from('grants')
    .select('id')
    .eq('id', grantId)
    .eq('portfolio_id', portfolioId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * GET /api/portfolio/[id]/grants/[grantId]/budget
 * List budget items for a grant
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'viewer');
    if (!access.ok) return access.response;
    const sb = access.context.db;
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return jsonError('Grant not found', 404);
    }

    const { data, error } = await sb
      .from('grant_budget_items')
      .select('*')
      .eq('grant_id', grantId)
      .order('category', { ascending: true });

    if (error) throw error;

    return jsonOk({ data: data || [] });
  } catch (err: unknown) {
    console.error('Error fetching budget items:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * POST /api/portfolio/[id]/grants/[grantId]/budget
 * Create a budget line item
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;

    const parsed = createBudgetItemSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { category, description, budgeted_amount } = parsed.data;

    const sb = access.context.db;
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return jsonError('Grant not found', 404);
    }

    const { data, error } = await sb
      .from('grant_budget_items')
      .insert({
        grant_id: grantId,
        category,
        description,
        budgeted_amount,
      })
      .select()
      .single();

    if (error) throw error;

    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    console.error('Error creating budget item:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * PATCH /api/portfolio/[id]/grants/[grantId]/budget?itemId=
 * Update a budget line item (e.g. actual_amount)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return jsonError('itemId is required', 400);
    }

    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;
    const parsed = updateBudgetItemSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    if (Object.keys(parsed.data).length === 0) return jsonError('No valid fields to update', 400);

    const sb = access.context.db;
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return jsonError('Grant not found', 404);
    }

    const { data, error } = await sb
      .from('grant_budget_items')
      .update(parsed.data)
      .eq('id', itemId)
      .eq('grant_id', grantId)
      .select()
      .single();

    if (error) throw error;

    return jsonOk({ data });
  } catch (err: unknown) {
    console.error('Error updating budget item:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * DELETE /api/portfolio/[id]/grants/[grantId]/budget?itemId=
 * Delete a budget line item
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return jsonError('itemId is required', 400);
    }

    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;
    const sb = access.context.db;
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return jsonError('Grant not found', 404);
    }

    const { error } = await sb
      .from('grant_budget_items')
      .delete()
      .eq('id', itemId)
      .eq('grant_id', grantId);

    if (error) throw error;

    return jsonOk({ success: true });
  } catch (err: unknown) {
    console.error('Error deleting budget item:', err);
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
