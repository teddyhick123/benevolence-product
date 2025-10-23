// app/api/external/charity-search/route.ts
import { NextResponse } from 'next/server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// GET /api/external/charity-search - Search IRS Tax-Exempt Organizations
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');

  if (!query || query.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  try {
    // IRS Tax Exempt Organization Search API
    // Documentation: https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads
    // Using the free IRS EO BMF (Exempt Organizations Business Master File) data

    // For MVP, we'll use a simple mock response
    // TODO: Integrate with actual IRS API or downloaded EO BMF data
    // Alternative: ProPublica Nonprofit Explorer API (free)
    // https://projects.propublica.org/nonprofits/api

    const mockResults = [
      {
        name: `${query} Foundation`,
        ein: '12-3456789',
        location: 'San Francisco, CA',
        mission: 'Dedicated to advancing social justice and equality through community empowerment and legal advocacy.',
      },
      {
        name: `${query} Justice Center`,
        ein: '98-7654321',
        location: 'Washington, DC',
        mission: 'Providing legal services and advocacy for immigrant communities and families in need.',
      },
      {
        name: `${query} Global Initiative`,
        ein: '45-6789012',
        location: 'New York, NY',
        mission: 'Working to end human trafficking through prevention, education, and survivor support programs.',
      },
    ];

    // In production, you would call the actual API here:
    // const response = await fetch(`https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(query)}`);
    // const data = await response.json();

    return NextResponse.json(
      {
        results: mockResults,
        source: 'mock', // Change to 'irs' or 'propublica' in production
      },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    console.error('Charity search error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search charities' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
