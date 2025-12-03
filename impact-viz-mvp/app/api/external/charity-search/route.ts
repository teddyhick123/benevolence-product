// app/api/external/charity-search/route.ts
import { NextResponse } from 'next/server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

/**
 * Format EIN to standard XX-XXXXXXX format
 */
function formatEIN(ein: string): string {
  // Remove any non-digits
  const digits = ein.replace(/\D/g, '');

  // Format as XX-XXXXXXX
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  return ein; // Return original if not 9 digits
}

/**
 * Transform ProPublica organization to our SearchResult format
 */
function transformOrganization(org: any) {
  return {
    name: org.name || 'Unknown Organization',
    ein: org.strein || formatEIN(org.ein || ''),
    location: [org.city, org.state].filter(Boolean).join(', ') || undefined,
    sector: org.ntee_desc || undefined,
    mission: undefined, // ProPublica doesn't provide mission statements
    website: undefined, // ProPublica doesn't provide websites
  };
}

// GET /api/external/charity-search - Search IRS Tax-Exempt Organizations
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const state = searchParams.get('state'); // Optional state filter (e.g., "CA", "NY")

  if (!query || query.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  try {
    // ProPublica Nonprofit Explorer API
    // Documentation: https://projects.propublica.org/nonprofits/api
    // Based on IRS Form 990 data (official source)

    const params = new URLSearchParams({ q: query });
    if (state) {
      params.set('state', state.toUpperCase());
    }

    const apiUrl = `https://projects.propublica.org/nonprofits/api/v2/search.json?${params}`;

    const response = await fetch(apiUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour (nonprofit data doesn't change frequently)
    });

    // ProPublica returns 404 when no results found - treat as empty results, not error
    if (response.status === 404) {
      return NextResponse.json(
        {
          results: [],
          source: 'propublica',
          total: 0,
        },
        { headers: cacheHeaders() }
      );
    }

    if (!response.ok) {
      // Other ProPublica API errors
      throw new Error(`ProPublica API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Transform organizations to our format
    const results = (data.organizations || []).map(transformOrganization);

    return NextResponse.json(
      {
        results,
        source: 'propublica',
        total: data.total_results || results.length,
      },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    console.error('Charity search error:', error);

    // Return user-friendly error
    return NextResponse.json(
      {
        error: 'Failed to search charities',
        message: error.message || 'Unknown error occurred',
        results: [], // Return empty array so UI doesn't break
      },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
