/**
 * Manual Geocoding API Endpoint
 *
 * POST /api/portfolio/[id]/holdings/[holdingId]/geocode
 *
 * Manually trigger geocoding for a specific holding.
 * Useful for:
 * - Retrying failed geocoding attempts
 * - Re-geocoding after location data corrections
 * - Testing geocoding functionality
 */

import { NextResponse } from 'next/server';
import { geocodeLocation } from '@/lib/services/google-maps';
import { geocodeApiResponseSchema } from '@/lib/schemas/geocoding';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; holdingId: string }> }
) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) return access.response;
  const sb = access.context.db;

  // Fetch holding to get location data
  const { data: holding, error: fetchErr } = await sb
    .from('holdings')
    .select('id, name, location_city, location_state, location_country, latitude, longitude')
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (fetchErr) {
    return NextResponse.json(
      { error: fetchErr.message },
      { status: 500, headers: cacheHeaders() }
    );
  }

  if (!holding) {
    return NextResponse.json(
      { error: 'Holding not found' },
      { status: 404, headers: cacheHeaders() }
    );
  }

  // Check if we have location data to geocode
  if (!holding.location_city && !holding.location_state && !holding.location_country) {
    return NextResponse.json(
      {
        success: false,
        result: null,
        error: 'No location data available. Please add city, state, or country to the holding.',
      },
      { status: 400, headers: cacheHeaders() }
    );
  }

  try {
    // Perform geocoding
    const geocodeResult = await geocodeLocation({
      city: holding.location_city || undefined,
      state: holding.location_state || undefined,
      country: holding.location_country || undefined,
    });

    // Prepare update payload
    const updatePayload = geocodeResult
      ? {
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
          geocoded_at: geocodeResult.geocodedAt,
          geocode_status: 'success' as const,
          geocode_provider: geocodeResult.provider,
          geocode_metadata: {
            formattedAddress: geocodeResult.formattedAddress,
            accuracy: geocodeResult.accuracy,
            placeId: geocodeResult.placeId,
            addressComponents: geocodeResult.addressComponents,
          },
        }
      : {
          geocode_status: 'failed' as const,
          geocoded_at: new Date().toISOString(),
          geocode_metadata: {
            error: 'No results found for this location',
          },
        };

    // Update holding in database
    const { error: updateErr } = await sb
      .from('holdings')
      .update(updatePayload)
      .eq('id', holdingId);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500, headers: cacheHeaders() }
      );
    }

    // Return validated response
    const response = geocodeApiResponseSchema.parse({
      success: geocodeResult !== null,
      result: geocodeResult,
      error: geocodeResult ? undefined : 'No results found for this location',
    });

    return NextResponse.json(response, { headers: cacheHeaders() });
  } catch (error) {
    console.error('Geocoding error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown geocoding error';

    // Update holding with failed status
    await sb
      .from('holdings')
      .update({
        geocode_status: 'failed',
        geocoded_at: new Date().toISOString(),
        geocode_metadata: {
          error: errorMessage,
        },
      })
      .eq('id', holdingId);

    return NextResponse.json(
      {
        success: false,
        result: null,
        error: errorMessage,
      },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
