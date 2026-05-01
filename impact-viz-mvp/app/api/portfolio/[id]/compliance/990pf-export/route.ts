import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/portfolio/[id]/compliance/990pf-export?year=2025
// Returns structured 990-PF data: qualifying distributions from grants, revenue summary
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

    // Verify portfolio access via RLS — just attempt a read
    const { data: portfolio, error: portErr } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolioId)
      .single();

    if (portErr || !portfolio) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch 990-PF data and grants in parallel
    const [pf990Res, grantsRes] = await Promise.all([
      supabase
        .from('foundation_990pf_data')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .maybeSingle(),
      supabase
        .from('tax_contributions')
        .select('id, contribution_date, recipient_name, recipient_ein, contribution_type, fair_market_value, description_of_property, deductible_amount')
        .eq('portfolio_id', portfolioId)
        .eq('tax_year', year)
        .gte('contribution_date', `${year}-01-01`)
        .lte('contribution_date', `${year}-12-31`)
        .order('contribution_date'),
    ]);

    const pf990 = pf990Res.data;
    const grants = grantsRes.data || [];

    const totalQualifyingDistributions = grants.reduce((s, g) => s + Number(g.deductible_amount ?? g.fair_market_value), 0);
    const totalGrantAmount = grants.reduce((s, g) => s + Number(g.fair_market_value), 0);

    const exportData = {
      portfolio: { id: portfolioId, name: portfolio.name },
      tax_year: year,
      generated_at: new Date().toISOString(),

      // Part I — Revenue and Expenses summary
      part_i: {
        net_investment_income: pf990?.net_investment_income ?? null,
        excise_tax_amount: pf990?.excise_tax_amount ?? null,
        excise_tax_rate: pf990?.excise_tax_rate ?? 1.39,
        total_grants: pf990?.total_grants ?? totalGrantAmount,
        total_expenses: pf990?.total_expenses ?? null,
      },

      // Part II — Minimum Distribution / Payout
      part_xi: {
        fair_market_value_assets: pf990?.fair_market_value_assets ?? null,
        required_payout: pf990?.required_payout ?? (pf990?.fair_market_value_assets ? pf990.fair_market_value_assets * 0.05 : null),
        actual_payout: pf990?.actual_payout ?? totalGrantAmount,
        payout_deficit: pf990?.payout_deficit ?? null,
        qualifying_distributions_total: totalQualifyingDistributions,
      },

      // Part XII — Qualifying Distributions (grants)
      part_xii: {
        grants_count: grants.length,
        grants_total: totalGrantAmount,
        qualifying_distributions_total: totalQualifyingDistributions,
        grants_detail: grants.map(g => ({
          id: g.id,
          date: g.contribution_date,
          recipient: g.recipient_name,
          recipient_ein: g.recipient_ein,
          recipient_type: g.recipient_type,
          amount: g.fair_market_value,
          deductible_amount: g.deductible_amount ?? g.fair_market_value,
          type: g.contribution_type,
          description: g.description_of_property,
        })),
      },
    };

    return NextResponse.json(exportData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
