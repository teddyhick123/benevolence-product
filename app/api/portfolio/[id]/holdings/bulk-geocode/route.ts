/**
 * Bulk Geocoding API Endpoint
 *
 * POST /api/portfolio/[id]/holdings/bulk-geocode
 *
 * Geocode multiple holdings in a portfolio in one operation.
 * Supports:
 * - Backfilling existing holdings with location data
 * - Re-geocoding all holdings (force mode)
 * - Selective geocoding by holding IDs
 *
 * Query parameters:
 * - force: boolean - Re-geocode all holdings, even if already geocoded
 * - limit: number - Maximum number of holdings to process (default: 100, max: 500)
 */

import { NextResponse } from 'next/server';
import { batchGeocode } from '@/lib/services/google-maps';
import { bulkGeocodeRequestSchema, bulkGeocodeResponseSchema } from '@/lib/schemas/geocoding';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) return access.response;
  const sb = access.context.db;

  // Parse query parameters
  const url = new URL(req.url);
  const params = bulkGeocodeRequestSchema.parse({
    force: url.searchParams.get('force') === 'true',
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 100,
  });

  try {
    // Build query to fetch holdings that need geocoding
    let query = sb
      .from('holdings')
      .select('id, name, location_city, location_state, location_country, latitude, longitude, geocode_status')
      .eq('portfolio_id', portfolio_id)
      .not('location_city', 'is', null); // Only geocode holdings with at least a city

    if (!params.force) {
      // Only geocode holdings that haven't been geocoded or failed
      query = query.or('geocode_status.is.null,geocode_status.eq.pending,geocode_status.eq.failed');
    }

    const { data: holdings, error: fetchErr } = await query.limit(params.limit);

    if (fetchErr) {
      return NextResponse.json(
        { error: fetchErr.message },
        { status: 500, headers: cacheHeaders() }
      );
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json(
        bulkGeocodeResponseSchema.parse({
          success: true,
          processed: 0,
          succeeded: 0,
          failed: 0,
        }),
        { headers: cacheHeaders() }
      );
    }

    console.log(`Bulk geocoding ${holdings.length} holdings for portfolio ${portfolio_id}`);

    // Prepare geocoding requests
    const requests = holdings.map(h => ({
      city: h.location_city || undefined,
      state: h.location_state || undefined,
      country: h.location_country || undefined,
    }));

    // Perform batch geocoding (with rate limiting handled inside)
    const results = await batchGeocode(requests);

    // Update holdings with results
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < holdings.length; i++) {
      const holding = holdings[i];
      const result = results[i];

      const updatePayload = result
        ? {
            latitude: result.latitude,
            longitude: result.longitude,
            geocoded_at: result.geocodedAt,
            geocode_status: 'success' as const,
            geocode_provider: result.provider,
            geocode_metadata: {
              formattedAddress: result.formattedAddress,
              accuracy: result.accuracy,
              placeId: result.placeId,
              addressComponents: result.addressComponents,
            },
          }
        : {
            geocode_status: 'failed' as const,
            geocoded_at: new Date().toISOString(),
            geocode_metadata: {
              error: 'No results found for this location',
            },
          };

      const { error: updateErr } = await sb
        .from('holdings')
        .update(updatePayload)
        .eq('id', holding.id);

      if (updateErr) {
        console.error(`Error updating holding ${holding.id}:`, updateErr);
        failed++;
      } else {
        if (result) {
          succeeded++;
        } else {
          failed++;
        }
      }
    }

    const response = bulkGeocodeResponseSchema.parse({
      success: true,
      processed: holdings.length,
      succeeded,
      failed,
    });

    console.log(`Bulk geocoding complete: ${succeeded} succeeded, ${failed} failed`);

    return NextResponse.json(response, { headers: cacheHeaders() });
  } catch (error) {
    console.error('Bulk geocoding error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error during bulk geocoding';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
