import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params; // <- await the params
  const url = new URL(_req.url);
  const debug = url.searchParams.get('debug') === '1';

  // Bind Supabase to the user's auth cookies so RLS can verify portfolio membership
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData?.user?.id ?? null;

  // Fetch holdings with geocoding data from holdings table
  const { data: holdingsData, error: holdingsError } = await supabase
    .from('holdings')
    .select('id, name, asset_type, status, funds_allocated, as_of, latitude, longitude, sector, country')
    .eq('portfolio_id', portfolio_id)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('name');

  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }

  const holdingsWithCoords = holdingsData ?? [];

  // Fetch additional locations from holding_locations table
  const { data: locationsData, error: locationsError } = await supabase
    .from('holding_locations')
    .select('id, holding_id, name, status, lon, lat, tags, holdings!inner(id, name, asset_type, sector, country, funds_allocated)')
    .eq('portfolio_id', portfolio_id)
    .order('name');

  if (locationsError) {
    console.error('Error fetching holding_locations:', locationsError);
    // Continue without locations data - map will still work with holdings
  }

  const holdingLocations = locationsData ?? [];

  // Combine all holding IDs for KPI/financial data fetch
  const holdingIdsFromHoldings = holdingsWithCoords.map((h) => h.id);
  const holdingIdsFromLocations = holdingLocations.map((l) => l.holding_id);
  const allHoldingIds = Array.from(new Set([...holdingIdsFromHoldings, ...holdingIdsFromLocations]));
  const holdingIds = allHoldingIds;

  // Fetch top KPIs for each holding (Phase 2: Rich popover)
  let kpisMap = new Map<string, any[]>();
  if (holdingIds.length > 0) {
    try {
      const { data: kpisData } = await supabase.rpc('get_top_kpis_per_holding', {
        p_holding_ids: holdingIds,
        p_limit: 3,
      });

      if (kpisData) {
        // Group KPIs by holding_id
        for (const kpi of kpisData) {
          const existingKpis = kpisMap.get(kpi.holding_id) || [];
          existingKpis.push({
            metricCode: kpi.metric_code,
            displayName: kpi.display_name,
            value: kpi.value,
            unit: kpi.unit,
            periodEnd: kpi.period_end,
          });
          kpisMap.set(kpi.holding_id, existingKpis);
        }
      }
    } catch (err) {
      console.error('Error fetching KPIs for map:', err);
      // Continue without KPIs - map will still work
    }
  }

  // Fetch financial data (total contributions) for each holding
  let financialMap = new Map<string, number>();
  if (holdingIds.length > 0) {
    try {
      const { data: contribData } = await supabase
        .from('holding_contributions')
        .select('holding_id, amount')
        .in('holding_id', holdingIds);

      if (contribData) {
        // Sum contributions by holding_id
        for (const contrib of contribData) {
          const existing = financialMap.get(contrib.holding_id) || 0;
          financialMap.set(contrib.holding_id, existing + (contrib.amount || 0));
        }
      }
    } catch (err) {
      console.error('Error fetching financial data for map:', err);
      // Continue without financial data
    }
  }

  // Transform holdings to map points with visual encoding data and KPIs
  const holdingPoints = holdingsWithCoords.map((d) => {
    // Derive tags from holding metadata
    const tags: string[] = [];
    if (d.asset_type) tags.push(d.asset_type);
    if (d.sector) tags.push(d.sector);
    if (d.country) tags.push(d.country);

    return {
      id: d.id,
      holdingId: d.id, // Holdings are now the primary source
      name: d.name,
      tags,
      status: d.status ?? null,
      asOf: d.as_of ?? null,
      amountUSD: d.funds_allocated ?? null,
      coords: [d.longitude, d.latitude] as [number, number],
      assetType: d.asset_type ?? null, // For color encoding in ImpactMap
      topKpis: kpisMap.get(d.id) || [], // Top 3 KPIs for popover
      totalContributions: financialMap.get(d.id) || 0, // Financial summary
      isPrimaryLocation: true, // Primary geocoded location from holdings table
      locationCount: 1, // Will be updated if holding has multiple locations
    };
  });

  // Transform holding_locations to map points
  const locationPoints = holdingLocations.map((loc: any) => {
    const holding = loc.holdings;
    const tags: string[] = loc.tags || [];

    // Add holding metadata to tags if not already present
    if (holding?.asset_type && !tags.includes(holding.asset_type)) {
      tags.push(holding.asset_type);
    }
    if (holding?.sector && !tags.includes(holding.sector)) {
      tags.push(holding.sector);
    }
    if (holding?.country && !tags.includes(holding.country)) {
      tags.push(holding.country);
    }

    return {
      id: loc.id, // Location ID
      holdingId: loc.holding_id, // Reference to parent holding
      name: `${holding?.name || 'Unknown'} - ${loc.name}`, // "Company Name - Office/Site Name"
      tags,
      status: loc.status ?? null,
      asOf: null, // Locations don't have as_of dates
      amountUSD: holding?.funds_allocated ?? null, // Use holding's funds_allocated
      coords: [loc.lon, loc.lat] as [number, number],
      assetType: holding?.asset_type ?? null,
      topKpis: kpisMap.get(loc.holding_id) || [], // KPIs from parent holding
      totalContributions: financialMap.get(loc.holding_id) || 0,
      isPrimaryLocation: false, // Additional location from holding_locations table
      locationName: loc.name, // Original location name
    };
  });

  // Calculate location counts for holdings with multiple locations
  const locationCountMap = new Map<string, number>();
  for (const loc of holdingLocations) {
    const count = locationCountMap.get(loc.holding_id) || 0;
    locationCountMap.set(loc.holding_id, count + 1);
  }

  // Update location counts on holding points
  for (const point of holdingPoints) {
    const additionalLocations = locationCountMap.get(point.holdingId) || 0;
    point.locationCount = 1 + additionalLocations; // Primary + additional locations
  }

  // Combine both point arrays
  const points = [...holdingPoints, ...locationPoints];

  const base = {
    points,
    count: points.length,
    portfolio_id_echo: portfolio_id,
  } as any;

  if (debug) {
    try {
      const sr = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: srData } = await sr
        .from('holdings')
        .select('id')
        .eq('portfolio_id', portfolio_id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      base.service_role_count = srData?.length ?? 0;
    } catch (e) {
      base.service_role_error = (e as Error)?.message ?? 'service role check failed';
    }
  }

  return NextResponse.json(base, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
