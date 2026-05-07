import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

/**
 * GET /api/charities/search/autocomplete
 * Fast autocomplete suggestions for charity search
 *
 * Query Parameters:
 * - q: Search query (required, min 2 characters)
 * - limit: Max results (default: 10, max: 20)
 *
 * Returns: Array of charity suggestions with name, EIN, sector, location
 */
export async function GET(req: Request) {
  const sb = await supabasePublic();
  const url = new URL(req.url);

  const query = url.searchParams.get('q') || '';
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10')));

  // Require minimum query length
  if (query.length < 2) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } }
    );
  }

  try {
    // Use full-text search for fast autocomplete
    // Search by name, EIN, or location
    const { data: charities, error } = await sb
      .from('charities')
      .select('id, ein, name, city, state')
      .eq('is_active', true)
      .or(
        `name.ilike.%${query}%,ein.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%`
      )
      .limit(limit);

    if (error) {
      console.error('Error in autocomplete search:', error);
      return NextResponse.json(
        { error: 'Failed to fetch suggestions' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const suggestions = charities?.map((charity) => ({
      id: charity.id,
      ein: charity.ein,
      name: charity.name,
      location: [charity.city, charity.state].filter(Boolean).join(', '),
    })) || [];

    return NextResponse.json(
      { suggestions },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } } // Cache for 5 minutes
    );
  } catch (err: any) {
    console.error('Error in autocomplete API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
