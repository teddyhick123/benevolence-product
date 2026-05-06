import { NextRequest, NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { charitiesLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

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
  req: NextRequest,
  { params }: { params: Promise<{ ein: string }> }
) {
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const ip = getIP(req);
    const { success, reset, remaining, limit } = await charitiesLimiter.limit(ip);
    if (!success) return rateLimitExceeded(reset, remaining, limit);
  }

  const sb = await supabasePublic();
  const { ein } = await params;
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

    // If portfolio_id provided, check if this charity is in the portfolio
    let portfolioMetadata = null;
    if (portfolioId) {
      const { data: canView } = await sb.rpc('can_view_portfolio', {
        p_portfolio_id: portfolioId,
      });

      if (canView) {
        const { data: entry } = await sb
          .from('portfolio_charities')
          .select('id, status, added_by, created_at, notes, min_investment, max_investment')
          .eq('portfolio_id', portfolioId)
          .eq('charity_ein', ein)
          .maybeSingle();

        if (entry) {
          portfolioMetadata = {
            entry_id: entry.id,
            status: entry.status,
            added_by: entry.added_by,
            added_at: entry.created_at,
            notes: entry.notes,
            min_investment: entry.min_investment,
            max_investment: entry.max_investment,
          };
        }
      }
    }

    return NextResponse.json(
      {
        data: {
          ...charity,
          impact_stories: [],
          recent_activity: [],
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
  { params }: { params: Promise<{ ein: string }> }
) {
  const sb = await supabasePublic();
  const { ein } = await params;

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
      .update(body)
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
