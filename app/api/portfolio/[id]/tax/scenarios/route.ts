import { NextResponse } from 'next/server';
import { supabasePublic, createAdminClient } from '@/lib/supabase';
import {
  calculateScenario,
  compareScenarios,
  calculateOptimalDonation,
  analyzeBunchingStrategy,
  type ScenarioInput,
} from '@/lib/tax/scenario-calculator';

/**
 * POST /api/portfolio/[id]/tax/scenarios
 * Run tax scenario analysis
 *
 * Body:
 * {
 *   mode: 'single' | 'compare' | 'optimal' | 'bunching',
 *   year: 2024,
 *   scenarios: ScenarioInput[]
 * }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await supabasePublic();

  // Check permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = await req.json();
    const { mode, year = new Date().getFullYear(), scenarios, donation_type, annual_amount, years } = body;

    // Fetch tax year data for AGI using admin client to bypass RLS
    // (RLS policies may block reading tax_years even for authorized users)
    const adminClient = createAdminClient();
    const { data: taxYear, error: taxYearError } = await adminClient
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    if (!taxYear || !taxYear.adjusted_gross_income) {
      return NextResponse.json(
        {
          error: 'AGI not set',
          message: `Please set your Adjusted Gross Income for ${year} before running scenarios.`,
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fetch donor profile for age (QCD eligibility)
    const { data: donorProfile } = await sb
      .from('owner_tax_profiles')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .maybeSingle();

    // Fetch existing contributions for the year
    const { data: summary } = await sb
      .from('v_portfolio_tax_summary')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .maybeSingle();

    const baseInput = {
      agi: taxYear.adjusted_gross_income,
      filing_status: taxYear.filing_status || donorProfile?.filing_status,
      age: donorProfile?.date_of_birth ? calculateAge(donorProfile.date_of_birth) : undefined,
      existing_contributions_60_pct: summary?.contributed_60_pct || 0,
      existing_contributions_50_pct: summary?.contributed_50_pct || 0,
      existing_contributions_30_pct: summary?.contributed_30_pct || 0,
      existing_contributions_20_pct: summary?.contributed_20_pct || 0,
    };

    // Mode: Single scenario
    if (mode === 'single') {
      if (!scenarios || scenarios.length === 0) {
        return NextResponse.json(
          { error: 'No scenario provided' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const scenarioInput: ScenarioInput = { ...baseInput, ...scenarios[0] };
      const result = calculateScenario(scenarioInput);

      return NextResponse.json(
        { data: result },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Mode: Compare scenarios
    if (mode === 'compare') {
      if (!scenarios || scenarios.length < 2) {
        return NextResponse.json(
          { error: 'Need at least 2 scenarios to compare' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const scenarioInputs: ScenarioInput[] = scenarios.map((s: any) => ({
        ...baseInput,
        ...s,
      }));

      const result = compareScenarios(scenarioInputs);

      return NextResponse.json(
        { data: result },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Mode: Calculate optimal donation amount
    if (mode === 'optimal') {
      if (!donation_type) {
        return NextResponse.json(
          { error: 'donation_type required for optimal calculation' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const existingInCategory = getExistingContributionsForType(donation_type, summary);

      const result = calculateOptimalDonation({
        agi: baseInput.agi,
        donation_type,
        existing_contributions_in_category: existingInCategory,
      });

      return NextResponse.json(
        { data: result },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Mode: Bunching strategy analysis
    if (mode === 'bunching') {
      if (!annual_amount || !donation_type || !years) {
        return NextResponse.json(
          { error: 'annual_amount, donation_type, and years required for bunching analysis' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const result = analyzeBunchingStrategy({
        agi: baseInput.agi,
        annual_donation_amount: annual_amount,
        donation_type,
        years_to_analyze: years,
        filing_status: baseInput.filing_status, // Pass filing status for correct standard deduction
        tax_year: year, // Pass tax year for correct standard deduction
      });

      return NextResponse.json(
        { data: result },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { error: 'Invalid mode. Use: single, compare, optimal, or bunching' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Scenario calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate scenarios' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * Helper: Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Helper: Get existing contributions for a donation type's AGI category
 */
function getExistingContributionsForType(donationType: string, summary: any): number {
  if (!summary) return 0;

  switch (donationType) {
    case 'cash':
      return summary.contributed_60_pct || 0;
    case 'conservation_easement':
      return summary.contributed_50_pct || 0;
    case 'stock':
    case 'real_estate':
    case 'pe_vc':
    case 'other_property':
      return summary.contributed_30_pct || 0;
    default:
      return 0;
  }
}
