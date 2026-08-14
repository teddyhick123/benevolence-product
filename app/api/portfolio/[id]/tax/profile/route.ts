import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { createTaxRepository } from '@/lib/api/repositories/tax';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createTaxProfileSchema, updateTaxProfileSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/api/validation';

/**
 * GET /api/portfolio/[id]/tax/profile?year=2024
 * Get tax profile for a specific year
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) {
    return access.reason === 'infrastructure'
      ? jsonError('Forbidden', 403)
      : access.response;
  }
  const sb = access.context.db;

  const { data, error } = await sb
    .from('tax_profiles')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ data: data ?? null });
}

/**
 * POST /api/portfolio/[id]/tax/profile
 * Create a new tax profile
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
  const validation = await validateRequest(req, createTaxProfileSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Ensure portfolio_id matches
  if (validated.portfolio_id !== portfolio_id) {
    return jsonError('Portfolio ID mismatch', 400);
  }

  // Insert tax profile
  const { data: created, error: insertErr } = await sb
    .from('tax_profiles')
    .insert({
      portfolio_id: validated.portfolio_id,
      tax_year: validated.tax_year,
      filing_status: validated.filing_status ?? null,
      estimated_agi: validated.estimated_agi ?? null,
      carryforward_from_prior: validated.carryforward_from_prior ?? 0,
    })
    .select()
    .single();

  if (insertErr) {
    return jsonError(insertErr.message, 500);
  }

  // Always ensure the canonical tax_years row exists for downstream tax planning.
  const taxRepository = createTaxRepository(access.context);
  const { error: taxYearError } = await taxRepository.syncTaxYear({
    taxYear: created.tax_year,
    adjustedGrossIncome: created.estimated_agi ?? null,
    filingStatus: created.filing_status ?? null,
  });

  if (taxYearError) {
    const { error: rollbackError } = await sb
      .from('tax_profiles')
      .delete()
      .eq('id', created.id)
      .eq('portfolio_id', portfolio_id);
    return jsonError(taxYearError.message, 500, {
      rollback_error: rollbackError?.message ?? null,
    });
  }

  return jsonOk({ data: created }, { status: 201 });
}

/**
 * PUT /api/portfolio/[id]/tax/profile?year=2024
 * Update an existing tax profile
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'forbidden'
      ? jsonError('Not authorized', 403)
      : access.response;
  }
  const sb = access.context.db;

  // Validate request body
  const validation = await validateRequest(req, updateTaxProfileSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  const { data: existing, error: existingErr } = await sb
    .from('tax_profiles')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .single();

  if (existingErr || !existing) {
    return jsonError(
      existingErr?.message ?? 'Tax profile not found',
      existingErr ? 500 : 404
    );
  }

  // Update tax profile
  const { data: updated, error: updateErr } = await sb
    .from('tax_profiles')
    .update(validated)
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .select()
    .single();

  if (updateErr) {
    return jsonError(updateErr.message, 500);
  }

  // Always ensure the canonical tax_years row exists for downstream tax planning.
  const taxRepository = createTaxRepository(access.context);
  const { error: taxYearError } = await taxRepository.syncTaxYear({
    taxYear: year,
    adjustedGrossIncome: updated.estimated_agi ?? null,
    filingStatus: updated.filing_status ?? null,
  });

  if (taxYearError) {
    const { error: rollbackError } = await sb
      .from('tax_profiles')
      .update({
        filing_status: existing.filing_status,
        estimated_agi: existing.estimated_agi,
        carryforward_from_prior: existing.carryforward_from_prior,
      })
      .eq('id', existing.id)
      .eq('portfolio_id', portfolio_id);
    return jsonError(taxYearError.message, 500, {
      rollback_error: rollbackError?.message ?? null,
    });
  }

  return jsonOk({ data: updated });
}
