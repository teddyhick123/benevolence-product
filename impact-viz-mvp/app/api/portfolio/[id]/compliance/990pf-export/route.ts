import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * GET /api/portfolio/[id]/compliance/990pf-export?year=2025&format=json|csv
 * Export structured 990-PF data by Part, or CSV of qualifying distributions
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();
    const format = searchParams.get('format') || 'json';

    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    const { data: member } = await sb
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    // Fetch all data in parallel
    const [payoutRes, distributionsRes, portfolioRes] = await Promise.all([
      sb.from('payout_history').select('*').eq('portfolio_id', portfolioId).eq('tax_year', year).maybeSingle(),
      sb.from('qualifying_distributions').select('*').eq('portfolio_id', portfolioId).eq('tax_year', year).order('distribution_date'),
      sb.from('portfolios').select('id, name').eq('id', portfolioId).single(),
    ]);

    const payout = payoutRes.data;
    const distributions = distributionsRes.data || [];
    const portfolio = portfolioRes.data;

    if (format === 'csv') {
      // Return qualifying distributions as CSV
      const headers = [
        'distribution_date', 'description', 'category', 'gross_amount',
        'qualifying_amount', 'excluded_amount', 'approved_by_board', 'board_approval_date',
      ];
      const rows = distributions.map(d => [
        d.distribution_date,
        `"${(d.description || '').replace(/"/g, '""')}"`,
        d.category,
        d.gross_amount,
        d.qualifying_amount,
        d.excluded_amount,
        d.approved_by_board,
        d.board_approval_date || '',
      ].join(','));

      const csv = [headers.join(','), ...rows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="990pf-distributions-${year}.csv"`,
        },
      });
    }

    // JSON: structured by 990-PF Part
    const byCategory = distributions.reduce((acc: Record<string, any[]>, d) => {
      if (!acc[d.category]) acc[d.category] = [];
      acc[d.category].push(d);
      return acc;
    }, {});

    const totalQualifying = distributions.reduce((s, d) => s + (d.qualifying_amount || 0), 0);
    const shortfall = payout
      ? Math.max(0, (payout.distributable_amount || 0) - totalQualifying)
      : null;

    const exportData = {
      portfolio: { id: portfolioId, name: portfolio?.name },
      tax_year: year,
      generated_at: new Date().toISOString(),
      // Part I – Analysis of Revenue and Expenses (summary)
      part_i: {
        minimum_investment_return: payout?.minimum_investment_return ?? null,
        distributable_amount: payout?.distributable_amount ?? null,
        qualifying_distributions_total: totalQualifying,
        surplus_or_deficit: payout?.surplus_or_deficit ?? (payout ? null : null),
        shortfall,
      },
      // Part II – Balance Sheets (asset data)
      part_ii: {
        avg_fair_market_value: payout?.avg_fair_market_value ?? null,
        investment_assets: payout?.investment_assets ?? null,
        cash_and_equivalents: payout?.cash_and_equivalents ?? null,
        net_value_non_charitable: payout?.net_value_non_charitable ?? null,
        acquisition_indebtedness: payout?.acquisition_indebtedness ?? null,
      },
      // Part XI – Distributable Amount
      part_xi: {
        net_value_non_charitable: payout?.net_value_non_charitable ?? null,
        minimum_investment_return: payout?.minimum_investment_return ?? null,
        excise_tax_paid: payout?.excise_tax_paid ?? null,
        distributable_amount: payout?.distributable_amount ?? null,
        qualifying_distributions_total: totalQualifying,
        carryover_from_prior_years: payout?.carryover_from_prior_years ?? null,
        carryover_to_next_year: payout?.carryover_to_next_year ?? null,
        carryover_expires_year: payout?.carryover_expires_year ?? null,
      },
      // Part XII – Qualifying Distributions
      part_xii: {
        grants_total: payout?.grants_total ?? distributions.filter(d => d.category === 'grants_paid').reduce((s, d) => s + (d.qualifying_amount || 0), 0),
        program_expenses_total: payout?.program_expenses_total ?? distributions.filter(d => d.category === 'program_expenses').reduce((s, d) => s + (d.qualifying_amount || 0), 0),
        admin_qualifying_total: payout?.admin_qualifying_total ?? distributions.filter(d => d.category === 'admin_expenses').reduce((s, d) => s + (d.qualifying_amount || 0), 0),
        set_asides_total: payout?.set_asides_total ?? distributions.filter(d => d.category === 'set_aside').reduce((s, d) => s + (d.qualifying_amount || 0), 0),
        total: totalQualifying,
        by_category: byCategory,
        detail: distributions,
      },
    };

    return NextResponse.json(exportData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
