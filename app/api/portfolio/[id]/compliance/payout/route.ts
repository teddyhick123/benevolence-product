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
      .select('fair_market_value, deductible_amount')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year);

    const actualDistributions =
      pf990?.actual_payout ??
      (contributions || []).reduce((s, c) => s + Number(c.fair_market_value), 0);

    // IRS 990-PF Part XIII: Minimum Investment Return
    // Step 1: Asset base — prefer average monthly FMV over year-end snapshot
    const assetBase = pf990?.avg_fair_market_value ?? pf990?.fair_market_value_assets ?? null;

    // Step 2: Net value of non-charitable-use assets (Part XIII lines 1–3)
    const exemptUseAssets = Number(pf990?.exempt_use_assets ?? 0);
    const acquisitionIndebtedness = Number(pf990?.acquisition_indebtedness ?? 0);
    const netValueNonCharitable = assetBase !== null
      ? Math.max(0, assetBase - exemptUseAssets - acquisitionIndebtedness)
      : null;

    // Step 3: Minimum Investment Return = 5% × net value of non-charitable-use assets
    const mir = netValueNonCharitable !== null ? netValueNonCharitable * 0.05 : null;

    // Step 4: Excise tax on net investment income (1.39% or stored rate)
    const exciseTaxRate = pf990?.excise_tax_rate ?? 1.39;
    const exciseTaxAmount = pf990?.excise_tax_amount != null
      ? Number(pf990.excise_tax_amount)
      : pf990?.net_investment_income
        ? (Number(pf990.net_investment_income) * exciseTaxRate) / 100
        : 0;

    // Step 5: Distributable amount = MIR − excise tax (§4942 required distribution)
    const distributableAmount = mir !== null ? Math.max(0, mir - exciseTaxAmount) : null;

    // Use stored override if present (manually entered from filed form), else computed
    const requiredPayout = pf990?.required_payout != null
      ? Number(pf990.required_payout)
      : distributableAmount;

    const surplusOrDeficit = requiredPayout !== null
      ? actualDistributions - requiredPayout
      : null;

    const pctDistributed =
      requiredPayout && requiredPayout > 0
        ? Math.round((actualDistributions / requiredPayout) * 10000) / 100
        : null;

    return NextResponse.json({
      portfolio_id: portfolioId,
      tax_year: year,
      net_assets: assetBase,
      avg_fmv_used: pf990?.avg_fair_market_value != null,
      required_payout: requiredPayout,
      actual_distributions: actualDistributions,
      surplus_or_deficit: surplusOrDeficit,
      pct_distributed: pctDistributed,
      // Part XIII breakdown
      exempt_use_assets: exemptUseAssets,
      acquisition_indebtedness: acquisitionIndebtedness,
      excise_tax_rate: exciseTaxRate,
      excise_tax_amount: exciseTaxAmount,
      has_self_dealing: pf990?.has_self_dealing ?? false,
      self_dealing_notes: pf990?.self_dealing_notes ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
