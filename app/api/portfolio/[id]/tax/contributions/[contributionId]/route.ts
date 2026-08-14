import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { updateTaxContributionSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/api/validation';

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]
 * Get a specific tax contribution
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) {
    return access.reason === 'infrastructure'
      ? jsonError('Forbidden', 403)
      : access.response;
  }
  const sb = access.context.db;

  const { data, error } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  if (!data) {
    return jsonError('Contribution not found', 404);
  }

  return jsonOk({ data });
}

/**
 * PUT /api/portfolio/[id]/tax/contributions/[contributionId]
 * Update a specific tax contribution
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'forbidden'
      ? jsonError('Not authorized', 403)
      : access.response;
  }
  const sb = access.context.db;

  // Validate request body
  const validation = await validateRequest(req, updateTaxContributionSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Update tax contribution
  const { data: updated, error: updateErr } = await sb
    .from('tax_contributions')
    .update(validated)
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (updateErr) {
    return jsonError(updateErr.message, 500);
  }

  // Fetch enriched version
  const { data: enriched } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('id', updated.id)
    .eq('portfolio_id', portfolio_id)
    .single();

  return jsonOk({ data: enriched ?? updated });
}

/**
 * DELETE /api/portfolio/[id]/tax/contributions/[contributionId]
 * Delete a specific tax contribution
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'owner');
  if (isAccessDenied(access)) {
    return access.reason === 'forbidden'
      ? jsonError('Only portfolio owners can delete contributions', 403)
      : access.response;
  }
  const sb = access.context.db;

  const { error: deleteErr } = await sb
    .from('tax_contributions')
    .delete()
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id);

  if (deleteErr) {
    return jsonError(deleteErr.message, 500);
  }

  return jsonOk({ success: true });
}
