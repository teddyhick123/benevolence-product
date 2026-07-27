import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createTaxCarryforwardSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/validation';
import { z } from 'zod';

const applyCarryforwardApplicationsSchema = z.object({
  tax_year: z.number().int().min(1900).max(2100),
  applications: z.array(z.object({
    carryforward_id: z.string().uuid(),
    amount_applied: z.number().positive(),
    notes: z.string().max(1000).optional().nullable(),
  })),
});

/**
 * GET /api/portfolio/[id]/tax/carryforwards
 * Get all active carryforwards for a portfolio
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) {
    return access.reason === 'infrastructure'
      ? jsonError('Forbidden', 403)
      : access.response;
  }
  const sb = access.context.db;

  // Use active carryforwards view
  const { data, error } = await sb
    .from('v_active_carryforwards')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .order('expires_tax_year', { ascending: true });

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ data: data ?? [] });
}

/**
 * POST /api/portfolio/[id]/tax/carryforwards
 * Create a new carryforward (typically done automatically, but can be manual)
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'forbidden'
      ? jsonError('Not authorized', 403)
      : access.response;
  }
  const sb = access.context.db;

  // Validate request body
  const validation = await validateRequest(req, createTaxCarryforwardSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Ensure portfolio_id matches
  if (validated.portfolio_id !== portfolio_id) {
    return jsonError('Portfolio ID mismatch', 400);
  }

  // Insert carryforward
  const { data: created, error: insertErr } = await sb
    .from('tax_carryforwards')
    .insert(validated)
    .select()
    .single();

  if (insertErr) {
    return jsonError(insertErr.message, 500);
  }

  return jsonOk({ data: created }, { status: 201 });
}

/**
 * PATCH /api/portfolio/[id]/tax/carryforwards
 * Persist carryforward applications for a tax year.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'forbidden'
      ? jsonError('Not authorized', 403)
      : access.response;
  }
  const sb = access.context.db;

  const validation = await validateRequest(req, applyCarryforwardApplicationsSchema);
  if (!validation.success) {
    return validation.response;
  }

  const { tax_year, applications } = validation.data;
  const { data, error } = await sb.rpc('replace_tax_carryforward_applications', {
    p_portfolio_id: portfolio_id,
    p_tax_year: tax_year,
    p_applications: applications,
  });

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ data });
}
