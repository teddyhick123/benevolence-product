import { NextRequest } from 'next/server';
import { requirePortfolioAccess } from '@/lib/api/access';
import { createPortfolioComplianceRepository } from '@/lib/api/repositories/compliance';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { calculatePayout } from '@/lib/compliance/payout';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/portfolio/[id]/compliance/990pf-export?year=2025
// Returns structured 990-PF data: qualifying distributions from grants, revenue summary.
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: portfolioId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'viewer');
    if (!access.ok) return access.response;
    const db = access.context.db;
    const rawYear = new URL(req.url).searchParams.get('year');
    const requestedYear = rawYear === null
      ? new Date().getFullYear() - 1
      : Number(rawYear);
    if (
      !Number.isFinite(requestedYear) ||
      !Number.isInteger(requestedYear) ||
      requestedYear < 1900 ||
      requestedYear > 2100
    ) {
      return jsonError('Invalid tax year', 400);
    }
    const year = requestedYear;

    const { data: portfolio, error: portErr } = await db
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolioId)
      .single();
    if (portErr || !portfolio) {
      return jsonError('Access denied', 403);
    }

    const [pf990Res, distributionsRes] = await Promise.all([
      db
        .from('foundation_990pf_data')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .maybeSingle(),
      db
        .from('qualifying_distributions')
        .select('id, grant_id, grant_payment_id, distribution_date, distribution_type, qualifying_amount, description, notes')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .gte('distribution_date', `${year}-01-01`)
        .lte('distribution_date', `${year}-12-31`)
        .order('distribution_date'),
    ]);

    if (pf990Res.error) return jsonError(pf990Res.error.message, 500);
    if (distributionsRes.error) return jsonError(distributionsRes.error.message, 500);

    const pf990 = pf990Res.data;
    const distributions = distributionsRes.data || [];
    const totalQualifyingDistributions = distributions.reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const grantDistributions = distributions.filter(
      distribution => distribution.distribution_type === 'grant' || distribution.grant_id
    );
    const totalGrantAmount = grantDistributions.reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const payout = calculatePayout(pf990, totalQualifyingDistributions);

    const exportData = {
      portfolio: { id: portfolioId, name: portfolio.name },
      tax_year: year,
      generated_at: new Date().toISOString(),
      part_i: {
        net_investment_income: pf990?.net_investment_income ?? null,
        excise_tax_amount: pf990?.excise_tax_amount ?? null,
        excise_tax_rate: pf990?.excise_tax_rate ?? 1.39,
        total_grants: pf990?.total_grants ?? totalGrantAmount,
        total_expenses: pf990?.total_expenses ?? null,
      },
      part_xi: {
        avg_fair_market_value: pf990?.avg_fair_market_value ?? null,
        fair_market_value_assets: pf990?.fair_market_value_assets ?? null,
        exempt_use_assets: payout.exemptUseAssets,
        acquisition_indebtedness: payout.acquisitionIndebtedness,
        net_value_non_charitable: payout.netValueNonCharitable,
        minimum_investment_return: payout.minimumInvestmentReturn,
        required_payout: payout.requiredPayout,
        actual_payout: payout.actualDistributions,
        payout_deficit: pf990?.payout_deficit ?? null,
        qualifying_distributions_total: totalQualifyingDistributions,
      },
      part_xii: {
        grants_count: grantDistributions.length,
        distribution_count: distributions.length,
        grants_total: totalGrantAmount,
        qualifying_distributions_total: totalQualifyingDistributions,
        grants_detail: distributions.map(distribution => ({
          id: distribution.id,
          date: distribution.distribution_date,
          grant_id: distribution.grant_id,
          grant_payment_id: distribution.grant_payment_id,
          amount: distribution.qualifying_amount,
          qualifying_amount: distribution.qualifying_amount,
          type: distribution.distribution_type,
          description: distribution.description,
          notes: distribution.notes,
        })),
      },
    };

    const compliance = createPortfolioComplianceRepository({
      orgId: access.context.orgId,
      portfolioId,
      actorId: access.context.user.id,
    });
    await compliance.record990PfExport({
      tax_year: year,
      total_qualifying_distributions: totalQualifyingDistributions,
      grants_count: grantDistributions.length,
      distribution_count: distributions.length,
      required_payout: payout.requiredPayout,
    });

    return jsonOk(exportData);
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
