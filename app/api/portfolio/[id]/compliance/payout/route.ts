import { NextRequest } from 'next/server';
import { requirePortfolioAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { calculatePayout } from '@/lib/compliance/payout';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/portfolio/[id]/compliance/payout?year=2025
// Returns { net_assets, required_payout (5%), actual_distributions, surplus_or_deficit, pct_distributed }
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: portfolioId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'viewer');
    if (!access.ok) return access.response;
    const db = access.context.db;
    const { searchParams } = new URL(req.url);
    const requestedYear = Number.parseInt(
      searchParams.get('year') ?? String(new Date().getFullYear() - 1),
      10
    );
    if (!Number.isFinite(requestedYear) || requestedYear < 1900 || requestedYear > 2100) {
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

    // Fetch 990-PF data
    const { data: pf990, error: pf990Error } = await db
      .from('foundation_990pf_data')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    if (pf990Error) {
      return jsonError(pf990Error.message, 500);
    }

    // Fetch actual qualifying distributions for the year. Donor tax
    // contribution rows are not a valid source for foundation payout facts.
    const { data: distributions, error: distributionsError } = await db
      .from('qualifying_distributions')
      .select('qualifying_amount')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);

    if (distributionsError) {
      return jsonError(distributionsError.message, 500);
    }

    const qualifyingDistributionTotal = (distributions || []).reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const payout = calculatePayout(pf990, qualifyingDistributionTotal);

    return jsonOk({
      portfolio_id: portfolioId,
      tax_year: year,
      net_assets: payout.assetBase,
      avg_fmv_used: payout.avgFmvUsed,
      required_payout: payout.requiredPayout,
      actual_distributions: payout.actualDistributions,
      surplus_or_deficit: payout.surplusOrDeficit,
      pct_distributed: payout.pctDistributed,
      // Part XIII breakdown
      exempt_use_assets: payout.exemptUseAssets,
      acquisition_indebtedness: payout.acquisitionIndebtedness,
      excise_tax_rate: payout.exciseTaxRate,
      excise_tax_amount: payout.exciseTaxAmount,
      has_self_dealing: pf990?.has_self_dealing ?? false,
      self_dealing_notes: pf990?.self_dealing_notes ?? null,
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
