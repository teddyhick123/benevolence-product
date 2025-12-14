import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

/**
 * GET /api/portfolio/[id]/tax/summary?year=2024
 * Get Phase 1 tax summary with AGI-based calculations
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const sb = await supabasePublic();

  try {
    // Fetch donor profile
    const { data: donorProfile, error: donorError } = await sb
      .from('donor_profiles')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .maybeSingle();

    if (donorError && donorError.code !== 'PGRST116') {
      console.error('Error fetching donor profile:', donorError);
    }

    // Fetch tax year data
    const { data: taxYear, error: taxYearError } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (taxYearError && taxYearError.code !== 'PGRST116') {
      console.error('Error fetching tax year:', taxYearError);
    }

    // Fetch portfolio tax summary from view
    const { data: summary, error: summaryError } = await sb
      .from('v_portfolio_tax_summary')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (summaryError && summaryError.code !== 'PGRST116') {
      console.error('Error fetching tax summary:', summaryError);
    }

    // Fetch contributions with limits
    const { data: contributions, error: contributionsError } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: false });

    if (contributionsError) {
      console.error('Error fetching contributions:', contributionsError);
    }

    // Fetch carryforward schedule
    const { data: carryforwards, error: carryforwardsError } = await sb
      .from('v_carryforward_schedule')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .gte('expires_tax_year', year)
      .order('expires_tax_year', { ascending: true });

    if (carryforwardsError) {
      console.error('Error fetching carryforwards:', carryforwardsError);
    }

    // Calculate donation capacity
    const { data: capacity, error: capacityError } = await sb
      .rpc('get_donation_capacity', {
        p_portfolio_id: portfolio_id,
        p_tax_year: year,
      })
      .maybeSingle();

    if (capacityError && capacityError.code !== 'PGRST116') {
      console.error('Error fetching donation capacity:', capacityError);
    }

    return NextResponse.json(
      {
        data: {
          taxYear: year,
          donorProfile: donorProfile ?? null,
          taxYearData: taxYear ?? null,
          summary: summary ?? null,
          contributions: contributions ?? [],
          carryforwards: carryforwards ?? [],
          capacity: capacity ?? null,
        },
      },
      { headers: { 'Cache-Control': 'private, s-maxage=60' } }
    );
  } catch (error) {
    console.error('Error fetching tax summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tax summary' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
