import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  calculateScenario,
  compareScenarios,
  calculateOptimalDonation,
  analyzeBunchingStrategy,
  type ScenarioInput,
} from '@/lib/tax/scenario-calculator';

/**
 * POST /api/portfolio/[id]/tax/scenarios
 * Run tax scenario analysis
 *
 * Body:
 * {
 *   mode: 'single' | 'compare' | 'optimal' | 'bunching',
 *   year: 2024,
 *   scenarios: ScenarioInput[]
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
    const { mode, year = new Date().getFullYear(), scenarios, donation_type, annual_amount, years } = body;

    const { data: taxYear } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (!taxYear || !taxYear.adjusted_gross_income) {
      return jsonError('AGI not set', 400, {
        message: `Please set your Adjusted Gross Income for ${year} before running scenarios.`,
      });
    }

    // Fetch existing contributions for the year
    const { data: summary } = await sb
      .from('v_portfolio_tax_summary')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    const baseInput = {
      agi: taxYear.adjusted_gross_income,
      filing_status: taxYear.filing_status,
      existing_contributions_60_pct: summary?.contributed_60_pct || 0,
      existing_contributions_50_pct: summary?.contributed_50_pct || 0,
      existing_contributions_30_pct: summary?.contributed_30_pct || 0,
      existing_contributions_20_pct: summary?.contributed_20_pct || 0,
    };

    // Mode: Single scenario
    if (mode === 'single') {
      if (!scenarios || scenarios.length === 0) {
        return jsonError('No scenario provided', 400);
      }

      const scenarioInput: ScenarioInput = { ...baseInput, ...scenarios[0] };
      const result = calculateScenario(scenarioInput);

      return jsonOk({ data: result });
    }

    // Mode: Compare scenarios
    if (mode === 'compare') {
      if (!scenarios || scenarios.length < 2) {
        return jsonError('Need at least 2 scenarios to compare', 400);
      }

      const scenarioInputs: ScenarioInput[] = scenarios.map((s: any) => ({
        ...baseInput,
        ...s,
      }));

      const result = compareScenarios(scenarioInputs);

      return jsonOk({ data: result });
    }

    // Mode: Calculate optimal donation amount
    if (mode === 'optimal') {
      if (!donation_type) {
        return jsonError('donation_type required for optimal calculation', 400);
      }

      const existingInCategory = getExistingContributionsForType(donation_type, summary);

      const result = calculateOptimalDonation({
        agi: baseInput.agi,
        donation_type,
        existing_contributions_in_category: existingInCategory,
      });

      return jsonOk({ data: result });
    }

    // Mode: Bunching strategy analysis
    if (mode === 'bunching') {
      if (!annual_amount || !donation_type || !years) {
        return jsonError(
          'annual_amount, donation_type, and years required for bunching analysis',
          400
        );
      }

      const result = analyzeBunchingStrategy({
        agi: baseInput.agi,
        annual_donation_amount: annual_amount,
        donation_type,
        years_to_analyze: years,
        filing_status: baseInput.filing_status, // Pass filing status for correct standard deduction
        tax_year: year, // Pass tax year for correct standard deduction
      });

      return jsonOk({ data: result });
    }

    return jsonError(
      'Invalid mode. Use: single, compare, optimal, or bunching',
      400
    );
  } catch (error) {
    return jsonError('Failed to calculate scenarios', 500);
  }
}

/**
 * Helper: Get existing contributions for a donation type's AGI category
 */
function getExistingContributionsForType(donationType: string, summary: any): number {
  if (!summary) return 0;

  switch (donationType) {
    case 'cash':
      return summary.contributed_60_pct || 0;
    case 'conservation_easement':
      return summary.contributed_50_pct || 0;
    case 'stock':
    case 'real_estate':
    case 'pe_vc':
    case 'other_property':
      return summary.contributed_30_pct || 0;
    default:
      return 0;
  }
}
