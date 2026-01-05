// app/api/portfolio/[id]/holdings/[holdingId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { updateHoldingSchema } from '@/lib/schemas/portfolio';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  // Permission gate — clearer error than raw RLS
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
    // Handle legacy field names before validation
    if (body.nav !== undefined && body.funds_allocated === undefined) {
      body.funds_allocated = body.nav;
    }
    if (body.as_of_date !== undefined && body.as_of === undefined) {
      body.as_of = body.as_of_date;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const validation = updateHoldingSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400, headers: cacheHeaders() }
    );
  }

  const validated = validation.data;

  // Build patch object from validated data (only include provided fields)
  const patch: Record<string, any> = {};
  if (validated.name !== undefined) patch.name = validated.name;
  if (validated.status !== undefined) patch.status = validated.status;
  if (validated.asset_type !== undefined) patch.asset_type = validated.asset_type;
  if (validated.custodian !== undefined) patch.custodian = validated.custodian;
  if (validated.valuation_method !== undefined) patch.valuation_method = validated.valuation_method;
  if (validated.sector !== undefined) patch.sector = validated.sector;
  if (validated.country !== undefined) patch.country = validated.country;
  if (validated.investee_id !== undefined) patch.investee_id = validated.investee_id;
  if (validated.funds_allocated !== undefined) patch.funds_allocated = validated.funds_allocated;
  if (validated.as_of !== undefined) patch.as_of = validated.as_of;

  // Location fields for geocoding
  if (validated.location_city !== undefined) patch.location_city = validated.location_city;
  if (validated.location_state !== undefined) patch.location_state = validated.location_state;
  if (validated.location_country !== undefined) patch.location_country = validated.location_country;

  // Manual geocoding override (if user provides exact coordinates)
  if (validated.latitude !== undefined) patch.latitude = validated.latitude;
  if (validated.longitude !== undefined) patch.longitude = validated.longitude;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { error: updErr } = await sb
    .from('holdings')
    .update(patch)
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500, headers: cacheHeaders() });

  // Auto-geocode if location fields changed (async, don't block response)
  const locationChanged =
    validated.location_city !== undefined ||
    validated.location_state !== undefined ||
    validated.location_country !== undefined;

  if (locationChanged) {
    // Import geocoding service dynamically to avoid cold start penalty
    import('@/lib/services/google-maps').then(async ({ geocodeLocation }) => {
      try {
        // Fetch current location data to construct full address
        const { data: current } = await sb
          .from('holdings')
          .select('location_city, location_state, location_country')
          .eq('id', holdingId)
          .single();

        if (!current) return;

        // Skip if no location data
        if (!current.location_city && !current.location_state && !current.location_country) {
          return;
        }

        // Perform geocoding
        const result = await geocodeLocation({
          city: current.location_city || undefined,
          state: current.location_state || undefined,
          country: current.location_country || undefined,
        });

        // Update holding with geocoding result
        const geocodePatch = result
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
              },
            }
          : {
              geocode_status: 'failed' as const,
              geocoded_at: new Date().toISOString(),
            };

        await sb
          .from('holdings')
          .update(geocodePatch)
          .eq('id', holdingId);
      } catch (err) {
        console.error('Auto-geocoding failed:', err);
        // Don't throw - geocoding failure shouldn't break the main update
      }
    }).catch(err => {
      console.error('Error importing geocoding service:', err);
    });
  }

  const { data, error: fetchErr } = await sb
    .from('v_holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      name,
      status,
      asset_type,
      funds_allocated,
      as_of,
      sector,
      country,
      custodian,
      valuation_method,
      created_at,
      updated_at
    `)
    .eq('id', holdingId)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return new Response(null, { status: 204, headers: cacheHeaders() });
}