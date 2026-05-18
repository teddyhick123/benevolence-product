import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createTaxContributionDraft, HoldingForTax } from '@/lib/helpers/tax-holding-link';

const getSupabase = createSupabaseServerClient;

/**
 * POST /api/holdings/[id]/create-tax-record
 * Creates a tax contribution record from a holding with auto-populated data.
 * Authorization: uses can_edit_portfolio RPC (not direct portfolio_members role check).
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

    // Get the holding (RLS enforces view access automatically)
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select(`
        id,
        name,
        asset_type,
        funds_allocated,
        created_at,
        portfolio_id,
        ein,
        portfolios!inner(org_id)
      `)
      .eq('id', holdingId)
      .maybeSingle();

    if (holdingError || !holding) {
      return NextResponse.json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Verify user has edit access to this portfolio via canonical RPC
    const { data: canEdit } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: holding.portfolio_id,
    });
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check that the tax module is enabled for this org
    const orgId = (holding.portfolios as any).org_id as string;
    const { data: hasModule } = await supabase.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'tax',
    });
    if (!hasModule) {
      return NextResponse.json({ error: 'Tax module not enabled' }, { status: 403 });
    }

    // Check if this holding already has a tax contribution.
    // Use maybeSingle() so "no row" is null (not an error).
    const { data: existingTax } = await supabase
      .from('tax_contributions')
      .select('id')
      .eq('holding_id', holdingId)
      .maybeSingle();

    if (existingTax) {
      return NextResponse.json(
        {
          error: 'Tax contribution already exists for this holding',
          existing_id: existingTax.id,
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
        .maybeSingle();

      if (perfData) {
        costBasis = perfData.cost_basis;
        currentNav = perfData.current_nav;
      }
    }

    // Build the HoldingForTax struct
    const holdingForTax: HoldingForTax = {
      id: holding.id,
      name: holding.name,
      asset_type: holding.asset_type,
      funds_allocated: holding.funds_allocated,
      created_at: holding.created_at,
      ein: holding.ein,
      cost_basis: costBasis,
      current_nav: currentNav,
    };

    const draft = createTaxContributionDraft(holdingForTax);

    // Guard: amount_usd must be > 0 to satisfy the DB CHECK constraint
    if (!draft.amount_usd || draft.amount_usd <= 0) {
      return NextResponse.json(
        { error: 'Holding has no allocated funds — set a value before creating a tax record' },
        { status: 400 }
      );
    }

    // Derive tax_year from contribution_date (canonical: no deduction_year column)
    const taxYear = new Date(draft.contribution_date).getFullYear();

    // Insert canonical tax_contributions row — no stale donation_date / deduction_year
    const { data: taxContribution, error: insertError } = await supabase
      .from('tax_contributions')
      .insert({
        portfolio_id: holding.portfolio_id,
        holding_id: draft.holding_id,
        contribution_date: draft.contribution_date,
        tax_year: draft.tax_year,
        contribution_type: draft.contribution_type,
        amount_usd: draft.amount_usd,
        fmv_at_donation: draft.fmv_at_donation ?? null,
        cost_basis: draft.cost_basis ?? null,
        recipient_name: draft.recipient_name,
        recipient_ein: draft.recipient_ein ?? null,
        property_description: draft.property_description ?? null,
        notes: draft.notes ?? null,
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

    // Get the holding (RLS enforces view access)
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
      .maybeSingle();

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
        .maybeSingle();

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

    // Check if already has tax record — maybeSingle() returns null if no row (not an error)
    const { data: existingTax } = await supabase
      .from('tax_contributions')
      .select('id')
      .eq('holding_id', holdingId)
      .maybeSingle();

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
