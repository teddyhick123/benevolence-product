import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createGrantDetailsSchema, updateGrantDetailsSchema } from '@/lib/schemas/grant';

const getSupabase = createSupabaseServerClient;

/**
 * GET /api/portfolio/[id]/holdings/[holdingId]/grant-details
 * Get grant details for a holding
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const supabase = await getSupabase();

    // Verify holding belongs to portfolio and user has access
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('id, name, portfolio_id, asset_type')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Get grant details if they exist
    const { data: grantDetails, error } = await supabase
      .from('grant_details')
      .select('*')
      .eq('holding_id', holdingId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching grant details:', error);
      return NextResponse.json({ error: 'Failed to fetch grant details' }, { status: 500 });
    }

    return NextResponse.json({
      data: grantDetails || null,
    });
  } catch (error) {
    console.error('Unexpected error in GET grant details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/holdings/[holdingId]/grant-details
 * Create grant details for a holding
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body
    const validated = createGrantDetailsSchema.parse({
      ...body,
      holding_id: holdingId, // Ensure holding_id matches URL
    });

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    const { data: holding } = await supabase
      .from('holdings')
      .select('id, asset_type')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    // Verify this is a grant asset type
    if (!['foundation_grant', 'daf_grant'].includes(holding.asset_type)) {
      return NextResponse.json(
        { error: 'Grant details can only be added to grant holdings' },
        { status: 400 }
      );
    }

    // Insert grant details
    const { data: grantDetails, error } = await supabase
      .from('grant_details')
      .insert({
        holding_id: validated.holding_id,
        grant_period_start: validated.grant_period_start ?? null,
        grant_period_end: validated.grant_period_end ?? null,
        grant_type: validated.grant_type ?? null,
        renewal_eligible: validated.renewal_eligible,
        renewal_date: validated.renewal_date ?? null,
        deliverables: validated.deliverables ?? null,
        reporting_frequency: validated.reporting_frequency ?? null,
        next_report_due: validated.next_report_due ?? null,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Grant details already exist for this holding. Use PATCH to update.' },
          { status: 409 }
        );
      }
      console.error('Error creating grant details:', error);
      return NextResponse.json({ error: 'Failed to create grant details' }, { status: 500 });
    }

    return NextResponse.json({ data: grantDetails }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in POST grant details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/portfolio/[id]/holdings/[holdingId]/grant-details
 * Update grant details for a holding
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body
    const validated = updateGrantDetailsSchema.parse(body);

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    // Verify grant details exist
    const { data: existingGrant, error: fetchError } = await supabase
      .from('grant_details')
      .select('id, holding_id')
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingGrant) {
      return NextResponse.json(
        { error: 'Grant details not found. Use POST to create.' },
        { status: 404 }
      );
    }

    // Update grant details
    const updateData: any = {};
    if (validated.grant_period_start !== undefined) updateData.grant_period_start = validated.grant_period_start;
    if (validated.grant_period_end !== undefined) updateData.grant_period_end = validated.grant_period_end;
    if (validated.grant_type !== undefined) updateData.grant_type = validated.grant_type;
    if (validated.renewal_eligible !== undefined) updateData.renewal_eligible = validated.renewal_eligible;
    if (validated.renewal_date !== undefined) updateData.renewal_date = validated.renewal_date;
    if (validated.deliverables !== undefined) updateData.deliverables = validated.deliverables;
    if (validated.reporting_frequency !== undefined) updateData.reporting_frequency = validated.reporting_frequency;
    if (validated.next_report_due !== undefined) updateData.next_report_due = validated.next_report_due;
    updateData.updated_at = new Date().toISOString();

    const { data: grantDetails, error } = await supabase
      .from('grant_details')
      .update(updateData)
      .eq('holding_id', holdingId)
      .select()
      .single();

    if (error) {
      console.error('Error updating grant details:', error);
      return NextResponse.json({ error: 'Failed to update grant details' }, { status: 500 });
    }

    return NextResponse.json({ data: grantDetails });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in PATCH grant details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/holdings/[holdingId]/grant-details
 * Delete grant details for a holding
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const supabase = await getSupabase();

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    // Verify grant details exist
    const { data: existingGrant, error: fetchError } = await supabase
      .from('grant_details')
      .select('id, holding_id')
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingGrant) {
      return NextResponse.json(
        { error: 'Grant details not found' },
        { status: 404 }
      );
    }

    // Delete grant details (will cascade to milestones and reports)
    const { error } = await supabase
      .from('grant_details')
      .delete()
      .eq('holding_id', holdingId);

    if (error) {
      console.error('Error deleting grant details:', error);
      return NextResponse.json({ error: 'Failed to delete grant details' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Grant details deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE grant details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
