import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access via RLS
    const { data: portfolio, error: portErr } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolioId)
      .single();

    if (portErr || !portfolio) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch 990-PF data
    const { data: pf990 } = await supabase
      .from('foundation_990pf_data')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .maybeSingle();

    // Fetch actual distributions from tax_contributions for the year
    const { data: contributions } = await supabase
      .from('tax_contributions')
      .select('amount_usd, deductible_amount')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);

    const actualDistributions =
      pf990?.actual_payout ??
      (contributions || []).reduce((s, c) => s + Number(c.amount_usd), 0);

    const netAssets = pf990?.fair_market_value_assets ?? null;
    const requiredPayout = pf990?.required_payout ?? (netAssets ? netAssets * 0.05 : null);
    const surplusOrDeficit =
      pf990?.payout_deficit !== undefined && pf990?.payout_deficit !== null
        ? -pf990.payout_deficit
        : requiredPayout !== null
          ? actualDistributions - requiredPayout
          : null;

    const pctDistributed =
      requiredPayout && requiredPayout > 0
        ? Math.round((actualDistributions / requiredPayout) * 10000) / 100
        : null;

    return NextResponse.json({
      portfolio_id: portfolioId,
      tax_year: year,
      net_assets: netAssets,
      required_payout: requiredPayout,
      actual_distributions: actualDistributions,
      surplus_or_deficit: surplusOrDeficit,
      pct_distributed: pctDistributed,
      // Extra context
      excise_tax_rate: pf990?.excise_tax_rate ?? 1.39,
      excise_tax_amount: pf990?.excise_tax_amount ?? null,
      has_self_dealing: pf990?.has_self_dealing ?? false,
      self_dealing_notes: pf990?.self_dealing_notes ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
