import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { fetchCharityRatings, shouldRefreshRatings, CharityRatingsData } from '@/lib/services/charity-ratings';

/**
 * GET /api/recommendations/[id]/ratings
 *
 * Fetches charity ratings for a recommendation. Returns cached data if fresh,
 * or fetches new data from external APIs if stale or forced.
 *
 * Query params:
 * - forceRefresh: boolean - Skip cache and fetch fresh data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id: recommendationId } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the recommendation
    const { data: recommendation, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('id, ein, organization_name, accreditation, portfolio_id')
      .eq('id', recommendationId)
      .single();

    if (recError || !recommendation) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this recommendation's portfolio
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('portfolio_id', recommendation.portfolio_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Unauthorized - not a member of this portfolio' },
        { status: 403 }
      );
    }

    // Check if we should use cached data
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === 'true';
    const existingAccreditation = recommendation.accreditation as any;

    // If we have cached data and it's fresh, return it
    if (
      !forceRefresh &&
      existingAccreditation?.ratings?.lastUpdated &&
      !shouldRefreshRatings(
        existingAccreditation.ratings.lastUpdated,
        existingAccreditation.ratings.nextRefreshAfter
      )
    ) {
      return NextResponse.json({
        cached: true,
        ratings: existingAccreditation.ratings,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Fetch fresh ratings data
    if (!recommendation.ein) {
      return NextResponse.json(
        {
          error: 'EIN required',
          message: 'This recommendation does not have an EIN. Add an EIN to fetch charity ratings.',
        },
        { status: 400 }
      );
    }

    const ratingsData = await fetchCharityRatings({
      ein: recommendation.ein,
      name: recommendation.organization_name,
      forceRefresh: true,
    });

    // Update the recommendation's accreditation field
    const updatedAccreditation = {
      ...(existingAccreditation || {}),
      ratings: ratingsData,
    };

    const { error: updateError } = await supabase
      .from('portfolio_recommendations')
      .update({
        accreditation: updatedAccreditation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId);

    if (updateError) {
      console.error('Failed to update recommendation with ratings:', updateError);
      // Still return the data even if cache update fails
      return NextResponse.json({
        cached: false,
        ratings: ratingsData,
        warning: 'Ratings fetched but cache update failed',
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({
      cached: false,
      ratings: ratingsData,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('Error fetching charity ratings:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch charity ratings',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recommendations/[id]/ratings/refresh
 *
 * Manually triggers a refresh of charity ratings data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id: recommendationId } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the recommendation
    const { data: recommendation, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('id, ein, organization_name, portfolio_id')
      .eq('id', recommendationId)
      .single();

    if (recError || !recommendation) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this recommendation's portfolio
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('portfolio_id', recommendation.portfolio_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Unauthorized - not a member of this portfolio' },
        { status: 403 }
      );
    }

    // Fetch fresh ratings
    if (!recommendation.ein) {
      return NextResponse.json(
        {
          error: 'EIN required',
          message: 'This recommendation does not have an EIN. Add an EIN to fetch charity ratings.',
        },
        { status: 400 }
      );
    }

    const ratingsData = await fetchCharityRatings({
      ein: recommendation.ein,
      name: recommendation.organization_name,
      forceRefresh: true,
    });

    // Update the recommendation
    const { data: updated, error: updateError } = await supabase
      .from('portfolio_recommendations')
      .update({
        accreditation: {
          ratings: ratingsData,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update recommendation: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      ratings: ratingsData,
      recommendation: updated,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('Error refreshing charity ratings:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh charity ratings',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
