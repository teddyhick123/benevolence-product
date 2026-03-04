// app/api/portfolio/[id]/analytics/risk/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders(isGet = false) {
  return isGet
    ? { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } as const
    : { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);

  const risk_type = url.searchParams.get('risk_type') || 'all';
  const include_history = url.searchParams.get('include_history') === 'true';

  const sb = await createSb();

  // Get latest risk snapshot
  const { data: latestSnapshot, error: snapshotError } = await sb
    .from('portfolio_risk_snapshots')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If no snapshot or it's old, generate a new one
  const today = new Date().toISOString().split('T')[0];
  let currentSnapshot = latestSnapshot;

  if (!latestSnapshot || latestSnapshot.snapshot_date !== today) {
    // Generate new snapshot
    const { data: newSnapshotId, error: genError } = await sb.rpc('generate_risk_snapshot', {
      p_portfolio_id: portfolio_id,
    });

    if (!genError && newSnapshotId) {
      const { data: newSnapshot } = await sb
        .from('portfolio_risk_snapshots')
        .select('*')
        .eq('id', newSnapshotId)
        .single();

      if (newSnapshot) {
        currentSnapshot = newSnapshot;
      }
    }
  }

  if (!currentSnapshot) {
    // Calculate risk on the fly if no snapshot
    const { data: holdings } = await sb
      .from('holdings')
      .select('id, name, sector, country, funds_allocated, asset_type')
      .eq('portfolio_id', portfolio_id);

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        risk: {
          error: 'No holdings found',
          total_holdings: 0,
        },
      }, { headers: cacheHeaders() });
    }

    const totalAllocation = holdings.reduce((sum, h: any) => sum + (h.funds_allocated || 0), 0);
    const result: any = {
      total_holdings: holdings.length,
      total_allocation: totalAllocation,
      snapshot_date: today,
    };

    // Concentration risk
    if (risk_type === 'concentration' || risk_type === 'all') {
      const sorted = [...holdings].sort((a: any, b: any) => (b.funds_allocated || 0) - (a.funds_allocated || 0));
      const top3 = sorted.slice(0, 3);
      const top3Total = top3.reduce((sum, h: any) => sum + (h.funds_allocated || 0), 0);
      const top3Percent = totalAllocation > 0 ? (top3Total / totalAllocation) * 100 : 0;

      result.concentration = {
        top_3_holdings: top3.map((h: any) => ({
          name: h.name,
          allocation: h.funds_allocated,
          percent: totalAllocation > 0 ? ((h.funds_allocated || 0) / totalAllocation) * 100 : 0,
        })),
        top_3_percent: top3Percent,
        risk_level: top3Percent > 60 ? 'critical' : top3Percent > 50 ? 'high' : top3Percent > 30 ? 'medium' : 'low',
      };
    }

    // Sector risk
    if (risk_type === 'sector' || risk_type === 'all') {
      const bySector: Record<string, { amount: number; count: number }> = {};
      holdings.forEach((h: any) => {
        const sector = h.sector || 'Unknown';
        if (!bySector[sector]) bySector[sector] = { amount: 0, count: 0 };
        bySector[sector].amount += h.funds_allocated || 0;
        bySector[sector].count++;
      });

      const sectorEntries = Object.entries(bySector)
        .map(([sector, data]) => ({
          sector,
          ...data,
          percent: totalAllocation > 0 ? (data.amount / totalAllocation) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      const largestSectorPercent = sectorEntries[0]?.percent || 0;

      result.sector = {
        distribution: sectorEntries,
        sector_count: sectorEntries.length,
        largest_sector: sectorEntries[0]?.sector,
        largest_sector_percent: largestSectorPercent,
        risk_level: largestSectorPercent > 70 ? 'high' : largestSectorPercent > 50 ? 'medium' : 'low',
      };
    }

    // Geography risk
    if (risk_type === 'geography' || risk_type === 'all') {
      const byGeo: Record<string, { amount: number; count: number }> = {};
      holdings.forEach((h: any) => {
        const geo = h.country || 'Unknown';
        if (!byGeo[geo]) byGeo[geo] = { amount: 0, count: 0 };
        byGeo[geo].amount += h.funds_allocated || 0;
        byGeo[geo].count++;
      });

      const geoEntries = Object.entries(byGeo)
        .map(([geography, data]) => ({
          geography,
          ...data,
          percent: totalAllocation > 0 ? (data.amount / totalAllocation) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      const largestGeoPercent = geoEntries[0]?.percent || 0;

      result.geography = {
        distribution: geoEntries,
        geography_count: geoEntries.length,
        largest_geography: geoEntries[0]?.geography,
        largest_geography_percent: largestGeoPercent,
        risk_level: largestGeoPercent > 80 ? 'high' : largestGeoPercent > 60 ? 'medium' : 'low',
      };
    }

    return NextResponse.json({ risk: result }, { headers: cacheHeaders(true) });
  }

  // Build response from snapshot
  const result: any = {
    snapshot_date: currentSnapshot.snapshot_date,
    total_holdings: currentSnapshot.total_holdings,
    total_allocation: currentSnapshot.total_allocation,
    overall_risk_score: currentSnapshot.overall_risk_score,
    overall_risk_level: currentSnapshot.overall_risk_level,
    risk_factors: currentSnapshot.risk_factors,
  };

  if (risk_type === 'concentration' || risk_type === 'all') {
    result.concentration = {
      top_3_holdings: currentSnapshot.concentration_top3_holdings,
      top_3_percent: currentSnapshot.concentration_top3_percent,
      herfindahl_index: currentSnapshot.herfindahl_index,
      risk_level: currentSnapshot.concentration_risk_level,
    };
  }

  if (risk_type === 'sector' || risk_type === 'all') {
    result.sector = {
      distribution: currentSnapshot.sector_distribution,
      sector_count: currentSnapshot.sector_count,
      largest_sector_percent: currentSnapshot.largest_sector_percent,
      risk_level: currentSnapshot.sector_risk_level,
    };
  }

  if (risk_type === 'geography' || risk_type === 'all') {
    result.geography = {
      distribution: currentSnapshot.geography_distribution,
      geography_count: currentSnapshot.geography_count,
      largest_geography_percent: currentSnapshot.largest_geography_percent,
      risk_level: currentSnapshot.geography_risk_level,
    };
  }

  // Include history if requested
  if (include_history) {
    const { data: history } = await sb
      .from('portfolio_risk_snapshots')
      .select('snapshot_date, overall_risk_score, overall_risk_level, concentration_top3_percent, largest_sector_percent')
      .eq('portfolio_id', portfolio_id)
      .order('snapshot_date', { ascending: false })
      .limit(30);

    result.history = history || [];
  }

  return NextResponse.json({ risk: result }, { headers: cacheHeaders(true) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Force regenerate snapshot
  const { data: snapshotId, error } = await sb.rpc('generate_risk_snapshot', {
    p_portfolio_id: portfolio_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  if (!snapshotId) {
    return NextResponse.json({ error: 'Failed to generate snapshot' }, { status: 500, headers: cacheHeaders() });
  }

  const { data: snapshot } = await sb
    .from('portfolio_risk_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();

  return NextResponse.json({
    risk: snapshot,
    message: 'Risk snapshot generated successfully',
  }, { headers: cacheHeaders() });
}
