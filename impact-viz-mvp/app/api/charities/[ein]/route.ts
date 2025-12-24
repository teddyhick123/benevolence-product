import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

/**
 * GET /api/charities/[ein]
 * Get detailed information about a specific charity by EIN
 *
 * Includes:
 * - Full charity data
 * - Impact stories
 * - Recent activity feed
 * - Portfolio-specific metadata (if user has this charity in their portfolio)
 */
export async function GET(
  req: Request,
  { params }: { params: { ein: string } }
) {
  const sb = await supabasePublic();
  const { ein } = params;
  const url = new URL(req.url);
  const portfolioId = url.searchParams.get('portfolio_id');

  try {
    // Fetch charity by EIN
    const { data: charity, error: charityError } = await sb
      .from('charities')
      .select('*')
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

    // Fetch impact stories (limit to 10 most recent)
    const { data: impactStories } = await sb
      .from('charity_impact_stories')
      .select('*')
      .eq('charity_id', charity.id)
      .order('published_date', { ascending: false, nullsFirst: false })
      .limit(10);

    // Fetch recent activity (limit to 20 most recent)
    const { data: recentActivity } = await sb
      .from('charity_activity_feed')
      .select('*')
      .eq('charity_id', charity.id)
      .order('published_date', { ascending: false, nullsFirst: false })
      .limit(20);

    // If portfolio_id provided, check if this charity is in the portfolio
    let portfolioMetadata = null;
    if (portfolioId) {
      // Check if user has access to this portfolio
      const { data: canView } = await sb.rpc('can_view_portfolio', {
        p_portfolio_id: portfolioId,
      });

      if (canView) {
        // Get portfolio-specific recommendation data
        const { data: recommendation } = await sb
          .from('portfolio_recommendations')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .eq('charity_id', charity.id)
          .maybeSingle();

        if (recommendation) {
          portfolioMetadata = {
            recommendation_id: recommendation.id,
            interaction_status: recommendation.interaction_status,
            recommended_by: recommendation.recommended_by,
            recommended_at: recommendation.recommended_at,
            min_investment: recommendation.min_investment,
            max_investment: recommendation.max_investment,
            order_index: recommendation.order_index,
            status: recommendation.status,
          };
        }
      }
    }

    return NextResponse.json(
      {
        data: {
          ...charity,
          impact_stories: impactStories || [],
          recent_activity: recentActivity || [],
          portfolio_metadata: portfolioMetadata,
        },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=600' } } // Cache for 10 minutes
    );
  } catch (err: any) {
    console.error('Error in charity details API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * PUT /api/charities/[ein]
 * Update charity information
 * (Typically used for refreshing ratings, adding new data, etc.)
 */
export async function PUT(
  req: Request,
  { params }: { params: { ein: string } }
) {
  const sb = await supabasePublic();
  const { ein } = params;

  try {
    const body = await req.json();

    // Check if charity exists
    const { data: existing } = await sb
      .from('charities')
      .select('id')
      .eq('ein', ein)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: 'Charity not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Update charity data
    const { data: charity, error } = await sb
      .from('charities')
      .update({
        ...body,
        data_last_updated: new Date().toISOString(),
      })
      .eq('ein', ein)
      .select()
      .single();

    if (error) {
      console.error('Error updating charity:', error);
      return NextResponse.json(
        { error: 'Failed to update charity' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { data: charity },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('Error in charity update:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
