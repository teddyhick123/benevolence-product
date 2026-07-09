import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePayout } from '@/lib/compliance/payout';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/portfolio/[id]/compliance/payout?year=2025
// Returns { net_assets, required_payout (5%), actual_distributions, surplus_or_deficit, pct_distributed }
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: portfolioId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear() - 1;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canViewErr) {
      return json({ error: canViewErr.message }, { status: 500 });
    }
    if (!canView) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: portfolio, error: portErr } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolioId)
      .single();

    if (portErr || !portfolio) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch 990-PF data
    const { data: pf990, error: pf990Error } = await supabase
      .from('foundation_990pf_data')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    if (pf990Error) {
      return json({ error: pf990Error.message }, { status: 500 });
    }

    // Fetch actual qualifying distributions for the year. Donor tax
    // contribution rows are not a valid source for foundation payout facts.
    const { data: distributions, error: distributionsError } = await supabase
      .from('qualifying_distributions')
      .select('qualifying_amount')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);

    if (distributionsError) {
      return json({ error: distributionsError.message }, { status: 500 });
    }

    const qualifyingDistributionTotal = (distributions || []).reduce(
      (sum, distribution) => sum + Number(distribution.qualifying_amount || 0),
      0
    );
    const payout = calculatePayout(pf990, qualifyingDistributionTotal);

    return json({
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
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
