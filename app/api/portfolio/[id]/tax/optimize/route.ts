import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  optimizeDonationStrategy,
  generateOptimizationSummary,
  type OptimizationInput,
  type PortfolioHolding,
  type TaxSituation,
} from '@/lib/tax/optimization-engine';

/**
 * POST /api/portfolio/[id]/tax/optimize
 * Run optimization engine to find best donation strategies
 *
 * Body:
 * {
 *   year: 2024,
 *   donation_goal?: 500000,
 *   time_horizon?: 3,
 *   preferences?: {
 *     minimize_carryforward?: boolean,
 *     maximize_tax_savings?: boolean,
 *     prefer_bunching?: boolean
 *   }
 * }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Not authorized', 403);
  }
  const sb = access.context.db;

  try {
    const body = await req.json();
    const { year = new Date().getFullYear(), donation_goal, time_horizon = 1, preferences = {} } = body;

    const { data: taxYear } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (!taxYear || !taxYear.adjusted_gross_income) {
      return jsonError('AGI not set', 400, {
        message: `Please set your Adjusted Gross Income for ${year} before running optimization.`,
      });
    }

    // Fetch existing contributions summary
    const { data: summary } = await sb
      .from('v_portfolio_tax_summary')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    // Build tax situation
    const taxSituation: TaxSituation = {
      agi: taxYear.adjusted_gross_income,
      filing_status: taxYear.filing_status,
      existing_contributions_60_pct: summary?.contributed_60_pct || 0,
      existing_contributions_50_pct: summary?.contributed_50_pct || 0,
      existing_contributions_30_pct: summary?.contributed_30_pct || 0,
      existing_contributions_20_pct: summary?.contributed_20_pct || 0,
    };

    // Fetch holdings
    const { data: holdings, error: holdingsError } = await sb
      .from('v_holdings')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('status', 'active');

    if (holdingsError) {
    }

    // Fetch enhanced holding data for cost basis and FMV
    const holdingIds = holdings?.map(h => h.id) || [];
    const { data: enhancedHoldings } = await sb
      .from('holdings')
      .select('id, cost_basis, fmv')
      .eq('portfolio_id', portfolio_id)
      .in('id', holdingIds);

    // Map holdings to optimization format
    const portfolioHoldings: PortfolioHolding[] = (holdings || []).map((h: any) => {
      const enhanced = enhancedHoldings?.find((e: any) => e.id === h.id);
      return {
        id: h.id,
        name: h.name,
        asset_type: h.asset_type,
        funds_allocated: h.funds_allocated || 0,
        cost_basis: enhanced?.cost_basis,
        fmv: enhanced?.fmv || h.funds_allocated,
      };
    });

    // Run optimization
    const optimizationInput: OptimizationInput = {
      tax_situation: taxSituation,
      holdings: portfolioHoldings,
      donation_goal,
      time_horizon,
      preferences,
    };

    const strategies = optimizeDonationStrategy(optimizationInput);
    const summary_text = generateOptimizationSummary(strategies);

    return jsonOk({
      data: {
        strategies,
        summary: summary_text,
        tax_situation: taxSituation,
        holdings_analyzed: portfolioHoldings.length,
      },
    });
  } catch (error) {
    return jsonError('Failed to run optimization', 500);
  }
}
