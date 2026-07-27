import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

/**
 * GET /api/portfolio/[id]/tax/summary?year=2024
 * Get Phase 1 tax summary with AGI-based calculations
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const sb = access.context.db;

  try {
    // Fetch tax year data
    const { data: taxYear, error: taxYearError } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (taxYearError && taxYearError.code !== 'PGRST116') {
      console.error('Error fetching tax year:', taxYearError);
    }

    // Fetch portfolio tax summary from view
    const { data: summary, error: summaryError } = await sb
      .from('v_portfolio_tax_summary')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (summaryError && summaryError.code !== 'PGRST116') {
      console.error('Error fetching tax summary:', summaryError);
    }

    // Fetch contributions with limits
    const { data: contributions, error: contributionsError } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: false });

    if (contributionsError) {
      console.error('Error fetching contributions:', contributionsError);
    }

    // Fetch carryforward schedule
    const { data: carryforwards, error: carryforwardsError } = await sb
      .from('v_carryforward_schedule')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .gte('expires_tax_year', year)
      .order('expires_tax_year', { ascending: true });

    if (carryforwardsError) {
      console.error('Error fetching carryforwards:', carryforwardsError);
    }

    // Calculate donation capacity
    const { data: capacity, error: capacityError } = await sb
      .rpc('get_donation_capacity', {
        p_portfolio_id: portfolio_id,
        p_tax_year: year,
      })
      .maybeSingle();

    if (capacityError && capacityError.code !== 'PGRST116') {
      console.error('Error fetching donation capacity:', capacityError);
    }

    return jsonOk({
      data: {
        taxYear: year,
        taxYearData: taxYear ?? null,
        summary: summary ?? null,
        contributions: contributions ?? [],
        carryforwards: carryforwards ?? [],
        capacity: capacity ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching tax summary:', error);
    return jsonError('Failed to fetch tax summary', 500);
  }
}
