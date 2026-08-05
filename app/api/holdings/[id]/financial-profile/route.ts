// app/api/holdings/[id]/financial-profile/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireHoldingAccess } from '@/lib/api/access';
import { getOrganization } from '@/lib/services/propublica';
import { getCharityNavigatorRating } from '@/lib/services/charity-navigator';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/holdings/[id]/financial-profile
 * Fetch enriched financial data for a holding's linked charity.
 * Aggregates: charity record + ProPublica filings + Charity Navigator rating + cached analysis
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const access = await requireHoldingAccess(holdingId);
  if (isAccessDenied(access)) return access.response;
  const sb = access.context.db;

  try {
    // Fetch holding with charity link
    const { data: holding, error: holdingError } = await sb
      .from('holdings')
      .select('id, name, charity_id, portfolio_id')
      .eq('id', holdingId)
      .single();

    if (holdingError) throw holdingError;

    if (!holding?.charity_id) {
      return NextResponse.json(
        { error: 'No charity linked to this holding', code: 'NO_CHARITY' },
        { status: 404, headers: NO_STORE }
      );
    }

    // Fetch charity record from local DB
    const { data: charity, error: charityError } = await sb
      .from('charities')
      .select('*')
      .eq('id', holding.charity_id)
      .single();

    if (charityError) throw charityError;

    // Fetch ProPublica filing history and Charity Navigator rating in parallel
    const [propublicaOrg, cnRating, cachedAnalysis] = await Promise.all([
      charity.ein ? getOrganization(charity.ein).catch(() => null) : Promise.resolve(null),
      charity.ein ? getCharityNavigatorRating(charity.ein).catch(() => null) : Promise.resolve(null),
      sb
        .from('generated_financial_analyses')
        .select('*')
        .eq('holding_id', holdingId)
        .order('version', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => data),
    ]);

    // Extract filing history from ProPublica
    const filings = (propublicaOrg?.filings_with_data || []).map((f: any) => ({
      tax_year: f.tax_prd_yr,
      tax_period: f.tax_prd,
      total_revenue: f.totrevenue,
      total_expenses: f.totfuncexpns,
      total_assets: f.totassetsend,
      total_liabilities: f.totliabend,
      filing_url: f.url,
    }));

    return NextResponse.json({
      holding: {
        id: holding.id,
        name: holding.name,
      },
      charity: {
        id: charity.id,
        ein: charity.ein,
        name: charity.name,
        legal_name: charity.legal_name,
        sector: charity.sector,
        ntee_code: charity.ntee_code,
        city: charity.city,
        state: charity.state,
        website: charity.website,
        mission_statement: charity.mission_statement,
        annual_revenue: charity.annual_revenue,
        annual_expenses: charity.annual_expenses,
        assets: charity.assets,
        program_expense_ratio: charity.program_expense_ratio,
        irs_deductibility_status: charity.irs_deductibility_status,
        last_form_990_date: charity.last_form_990_date,
      },
      filings,
      charity_navigator_rating: cnRating,
      cached_analysis: cachedAnalysis ? {
        content: cachedAnalysis.analysis_content,
        generated_at: cachedAnalysis.generated_at,
        version: cachedAnalysis.version,
      } : null,
    }, { headers: NO_STORE });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch financial profile' },
      { status: 500, headers: NO_STORE }
    );
  }
}
