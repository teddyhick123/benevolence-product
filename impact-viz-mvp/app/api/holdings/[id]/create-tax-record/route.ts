import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createTaxContributionDraft, HoldingForTax } from '@/lib/helpers/tax-holding-link';

const getSupabase = createSupabaseServerClient;

/**
 * POST /api/holdings/[id]/create-tax-record
 * Creates a tax contribution record from a holding with auto-populated data
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: holdingId } = await params;
    const supabase = await getSupabase();

    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the holding with permission check
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select(`
        id,
        name,
        asset_type,
        funds_allocated,
        created_at,
        portfolio_id,
        portfolios!inner(id)
      `)
      .eq('id', holdingId)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Verify user has edit access to this portfolio
    const { data: member } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', holding.portfolio_id)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'editor'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check if this holding already has a tax contribution
    const { data: existingTax } = await supabase
      .from('tax_contributions')
      .select('id')
      .eq('holding_id', holdingId)
      .single();

    if (existingTax) {
      return NextResponse.json(
        {
          error: 'This holding already has a tax contribution record',
          tax_contribution_id: existingTax.id,
        },
        { status: 409 }
      );
    }

    // Try to get investment performance data if available
    let costBasis: number | null = null;
    let currentNav: number | null = null;

    if (['equity_investment', 'debt_investment', 'pri', 'mri'].includes(holding.asset_type || '')) {
      const { data: perfData } = await supabase
        .from('v_investment_performance')
        .select('cost_basis, current_nav')
        .eq('id', holdingId)
        .single();

      if (perfData) {
        costBasis = perfData.cost_basis;
        currentNav = perfData.current_nav;
      }
    }

    // Create draft with auto-populated data
    const holdingForTax: HoldingForTax = {
      id: holding.id,
      name: holding.name,
      asset_type: holding.asset_type,
      funds_allocated: holding.funds_allocated,
      created_at: holding.created_at,
      cost_basis: costBasis,
      current_nav: currentNav,
    };

    const draft = createTaxContributionDraft(holdingForTax);

    // Create the tax contribution record
    const { data: taxContribution, error: insertError } = await supabase
      .from('tax_contributions')
      .insert({
        portfolio_id: holding.portfolio_id,
        holding_id: draft.holding_id,
        contribution_type: draft.contribution_type,
        amount_usd: draft.amount_usd,
        cost_basis: draft.cost_basis,
        fmv_at_donation: draft.fmv_at_donation,
        recipient_name: draft.recipient_name,
        donation_date: draft.donation_date,
        deduction_year: draft.deduction_year,
        notes: draft.notes,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating tax contribution:', insertError);
      return NextResponse.json(
        { error: 'Failed to create tax contribution', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tax_contribution: taxContribution,
      message: 'Tax contribution record created successfully',
    });
  } catch (error: any) {
    console.error('Unexpected error in create-tax-record:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/holdings/[id]/create-tax-record
 * Preview what a tax contribution record would look like (without creating it)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: holdingId } = await params;
    const supabase = await getSupabase();

    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the holding
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select(`
        id,
        name,
        asset_type,
        funds_allocated,
        created_at,
        portfolio_id
      `)
      .eq('id', holdingId)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Try to get investment performance data if available
    let costBasis: number | null = null;
    let currentNav: number | null = null;

    if (['equity_investment', 'debt_investment', 'pri', 'mri'].includes(holding.asset_type || '')) {
      const { data: perfData } = await supabase
        .from('v_investment_performance')
        .select('cost_basis, current_nav')
        .eq('id', holdingId)
        .single();

      if (perfData) {
        costBasis = perfData.cost_basis;
        currentNav = perfData.current_nav;
      }
    }

    // Create draft preview
    const holdingForTax: HoldingForTax = {
      id: holding.id,
      name: holding.name,
      asset_type: holding.asset_type,
      funds_allocated: holding.funds_allocated,
      created_at: holding.created_at,
      cost_basis: costBasis,
      current_nav: currentNav,
    };

    const draft = createTaxContributionDraft(holdingForTax);

    // Check if already has tax record
    const { data: existingTax } = await supabase
      .from('tax_contributions')
      .select('id')
      .eq('holding_id', holdingId)
      .single();

    return NextResponse.json({
      preview: draft,
      has_existing_record: !!existingTax,
      existing_record_id: existingTax?.id || null,
    });
  } catch (error: any) {
    console.error('Unexpected error in create-tax-record preview:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
