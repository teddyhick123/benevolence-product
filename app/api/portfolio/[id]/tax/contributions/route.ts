import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createTaxContributionSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/api/validation';
import { determineAGILimitCategory } from '@/lib/tax/agi-calculator';

/**
 * GET /api/portfolio/[id]/tax/contributions?year=2024
 * Get all tax contributions for a specific year
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

  // Use enriched view for calculated fields
  const { data, error } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .order('contribution_date', { ascending: false });

  if (error) {
    return jsonError(error.message, 500);
  }

  // Get document counts for each contribution
  const contributionIds = (data ?? []).map((c) => c.id);
  let documentCounts: Record<string, number> = {};

  if (contributionIds.length > 0) {
    const { data: docs } = await sb
      .from('tax_documents')
      .select('tax_contribution_id')
      .in('tax_contribution_id', contributionIds);

    if (docs) {
      documentCounts = docs.reduce((acc, doc) => {
        const id = doc.tax_contribution_id;
        if (id) {
          acc[id] = (acc[id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
    }
  }

  // Merge document counts into contributions
  const enrichedData = (data ?? []).map((c) => ({
    ...c,
    document_count: documentCounts[c.id] || 0,
  }));

  return jsonOk({ data: enrichedData, count: enrichedData.length });
}

/**
 * POST /api/portfolio/[id]/tax/contributions
 * Create a new tax contribution
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
  const validation = await validateRequest(req, createTaxContributionSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Ensure portfolio_id matches
  if (validated.portfolio_id !== portfolio_id) {
    return jsonError('Portfolio ID mismatch', 400);
  }

  // Auto-determine AGI limit category if not provided
  let agiLimitCategory = validated.agi_limit_category;
  if (!agiLimitCategory && validated.recipient_type) {
    agiLimitCategory = determineAGILimitCategory(
      validated.contribution_type,
      validated.recipient_type
    );
  }

  // Calculate deductible amount (amount - quid pro quo value)
  const deductibleAmount =
    validated.deductible_amount ??
    validated.amount_usd - (validated.quid_pro_quo_value ?? 0);

  // Auto-determine if appraisal is required
  const requiresAppraisal =
    validated.requires_appraisal ??
    (!['cash', 'check', 'wire'].includes(validated.contribution_type) &&
      validated.amount_usd > 5000);

  // Insert tax contribution
  const { data: created, error: insertErr } = await sb
    .from('tax_contributions')
    .insert({
      portfolio_id: validated.portfolio_id,
      holding_id: validated.holding_id ?? null,
      holding_contribution_id: validated.holding_contribution_id ?? null,
      tax_year: validated.tax_year,
      contribution_date: validated.contribution_date,
      recipient_name: validated.recipient_name,
      recipient_ein: validated.recipient_ein ?? null,
      recipient_type: validated.recipient_type ?? null,
      is_qualified_organization: validated.is_qualified_organization ?? true,
      contribution_type: validated.contribution_type,
      amount_usd: validated.amount_usd,
      fmv_at_donation: validated.fmv_at_donation ?? null,
      cost_basis: validated.cost_basis ?? null,
      date_acquired: validated.date_acquired ?? null,
      property_description: validated.property_description ?? null,
      receipt_storage_path: validated.receipt_storage_path ?? null,
      acknowledgment_received: validated.acknowledgment_received ?? false,
      acknowledgment_date: validated.acknowledgment_date ?? null,
      acknowledgment_storage_path: validated.acknowledgment_storage_path ?? null,
      quid_pro_quo_value: validated.quid_pro_quo_value ?? 0,
      requires_appraisal: requiresAppraisal,
      appraisal_storage_path: validated.appraisal_storage_path ?? null,
      appraisal_date: validated.appraisal_date ?? null,
      appraisal_value: validated.appraisal_value ?? null,
      appraiser_name: validated.appraiser_name ?? null,
      appraiser_tin: validated.appraiser_tin ?? null,
      deductible_amount: deductibleAmount,
      applied_to_tax_year: validated.applied_to_tax_year ?? validated.tax_year,
      agi_limit_category: agiLimitCategory ?? null,
      qcd_qualified: validated.qcd_qualified ?? false,
      notes: validated.notes ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    return jsonError(insertErr.message, 500);
  }

  // Fetch enriched version
  const { data: enriched } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('id', created.id)
    .eq('portfolio_id', portfolio_id)
    .single();

  return jsonOk({ data: enriched ?? created }, { status: 201 });
}
