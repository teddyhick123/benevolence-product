import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

/**
 * POST /api/charities/[ein]/add-to-portfolio
 * Add a charity from the global database to a user's portfolio
 *
 * Body:
 * - portfolio_id: UUID (required)
 * - note: string (optional) - reason for adding
 * - min_investment: number (optional)
 * - max_investment: number (optional)
 * - interaction_status: string (optional) - defaults to "new"
 */
export async function POST(
  req: Request,
  { params }: { params: { ein: string } }
) {
  const sb = await supabasePublic();
  const { ein } = params;

  try {
    const body = await req.json();
    const {
      portfolio_id,
      note,
      min_investment,
      max_investment,
      interaction_status = 'new',
    } = body;

    // Validate required fields
    if (!portfolio_id) {
      return NextResponse.json(
        { error: 'portfolio_id is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Check if user has permission to modify this portfolio
    const { data: canModify, error: permissionError } = await sb.rpc(
      'can_modify_portfolio',
      { p_portfolio_id: portfolio_id }
    );

    if (permissionError || !canModify) {
      return NextResponse.json(
        { error: 'Not authorized to modify this portfolio' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Find charity by EIN
    const { data: charity, error: charityError } = await sb
      .from('charities')
      .select('id, name, ein')
      .eq('ein', ein)
      .eq('is_active', true)
      .maybeSingle();

    if (charityError) {
      console.error('Error fetching charity:', charityError);
      return NextResponse.json(
        { error: 'Failed to fetch charity' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!charity) {
      return NextResponse.json(
        { error: 'Charity not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Check if charity is already in this portfolio
    const { data: existing } = await sb
      .from('portfolio_recommendations')
      .select('id, status')
      .eq('portfolio_id', portfolio_id)
      .eq('charity_id', charity.id)
      .maybeSingle();

    if (existing) {
      // If charity exists but is archived, we can reactivate it
      if (existing.status === 'archived') {
        const { data: updated, error: updateError } = await sb
          .from('portfolio_recommendations')
          .update({
            status: 'active',
            interaction_status: interaction_status,
            min_investment,
            max_investment,
            recommended_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error reactivating recommendation:', updateError);
          return NextResponse.json(
            { error: 'Failed to reactivate charity in portfolio' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } }
          );
        }

        return NextResponse.json(
          {
            data: updated,
            message: 'Charity reactivated in portfolio',
          },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      // Charity already active in portfolio
      return NextResponse.json(
        {
          error: 'Charity already exists in this portfolio',
          recommendation_id: existing.id,
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Get current user ID for recommended_by
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Create new portfolio recommendation
    const { data: recommendation, error: createError } = await sb
      .from('portfolio_recommendations')
      .insert({
        portfolio_id,
        charity_id: charity.id,
        organization_name: charity.name,
        ein: charity.ein,
        recommended_by: user.id,
        interaction_status,
        min_investment,
        max_investment,
        status: 'active',
        description: note,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating recommendation:', createError);
      return NextResponse.json(
        { error: 'Failed to add charity to portfolio' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        data: recommendation,
        message: 'Charity added to portfolio successfully',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('Error in add-to-portfolio API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
