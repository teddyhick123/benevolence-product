import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { calculateAGILimits } from '@/lib/tax/agi-calculator';
import { generateComplianceReport } from '@/lib/tax/substantiation-validator';
import { summarizeCarryforwards, generateCarryforwardAlerts } from '@/lib/tax/carryforward-tracker';

/**
 * GET /api/portfolio/[id]/tax/overview?year=2024
 * Get comprehensive tax overview for a specific year
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
    // Fetch tax profile
    const { data: taxProfile } = await sb
      .from('tax_profiles')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    // Fetch contributions for the year
    const { data: contributions } = await sb
      .from('v_tax_contributions_enriched')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: false });

    // Fetch carryforwards
    const { data: carryforwards } = await sb
      .from('tax_carryforwards')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .order('expires_tax_year', { ascending: true });

    // Calculate totals
    const totalContributions = contributions?.reduce(
      (sum, c) => sum + c.amount_usd,
      0
    ) ?? 0;

    const totalDeductible = contributions?.reduce(
      (sum, c) => sum + (c.calculated_deductible_amount ?? c.amount_usd),
      0
    ) ?? 0;

    // Calculate AGI limits if we have estimated AGI
    let agiLimits = null;
    let carryforwardData = null;

    if (taxProfile?.estimated_agi && contributions && contributions.length > 0) {
      const agiCalc = calculateAGILimits(
        contributions as any,
        taxProfile.estimated_agi,
        year
      );
      agiLimits = agiCalc.limits;

      // Create carryforwards from calculation (these would be new)
      carryforwardData = {
        new: agiCalc.carryforwards,
        existing: carryforwards ?? [],
      };
    }

    // Generate compliance report
    let complianceReport = null;
    if (contributions && contributions.length > 0) {
      complianceReport = generateComplianceReport(contributions as any, year);
    }

    // Summarize carryforwards
    let carryforwardSummary = null;
    let carryforwardAlerts = null;
    if (carryforwards && carryforwards.length > 0) {
      carryforwardSummary = summarizeCarryforwards(carryforwards as any, year);
      carryforwardAlerts = generateCarryforwardAlerts(
        carryforwards as any,
        year,
        taxProfile?.estimated_agi ?? undefined
      );
    }

    // Contribution breakdown
    const contributionsByRecipient = contributions?.reduce(
      (acc, c) => {
        const existing = acc[c.recipient_name] || { name: c.recipient_name, total: 0, count: 0 };
        existing.total += c.amount_usd;
        existing.count += 1;
        acc[c.recipient_name] = existing;
        return acc;
      },
      {} as Record<string, { name: string; total: number; count: number }>
    );

    const contributionsByType = contributions?.reduce(
      (acc, c) => {
        acc[c.contribution_type] = (acc[c.contribution_type] || 0) + c.amount_usd;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count missing documentation
    const missingDocumentation = contributions?.filter(
      (c) => !c.is_compliant
    ).length ?? 0;

    return jsonOk({
      data: {
        taxYear: year,
        taxProfile: taxProfile ?? null,
        summary: {
          totalContributions,
          totalDeductible,
          contributionCount: contributions?.length ?? 0,
          missingDocumentation,
          complianceScore: complianceReport?.overallScore ?? null,
        },
        agiLimits,
        contributions: contributions ?? [],
        contributionsByRecipient: Object.values(contributionsByRecipient ?? {}),
        contributionsByType,
        carryforwards: carryforwardData,
        carryforwardSummary,
        carryforwardAlerts,
        complianceReport,
      },
    });
  } catch (error) {
    console.error('Error fetching tax overview:', error);
    return jsonError('Failed to fetch tax overview', 500);
  }
}
