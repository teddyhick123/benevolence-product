// app/api/holdings/[id]/search-charity/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { searchOrganizations, convertToCharity } from '@/lib/services/propublica';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/holdings/[id]/search-charity?q=search+term
 * Search for charities to link to a holding.
 * Searches local DB first, then ProPublica for additional results.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const sb = await createServerClient();

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }

    const { data: holding, error: holdingError } = await sb
      .from('holdings')
      .select('portfolio_id')
      .eq('id', holdingId)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404, headers: NO_STORE });
    }

    const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
      p_portfolio_id: holding.portfolio_id,
    });

    if (canEditErr || !canEdit) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: NO_STORE });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const state = searchParams.get('state') || undefined;

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400, headers: NO_STORE }
      );
    }

    // Search local charities DB first
    let localQuery = sb
      .from('charities')
      .select('id, ein, name, city, state, sector, annual_revenue, mission_statement')
      .textSearch('search_vector', query, { type: 'websearch' })
      .limit(10);

    if (state) {
      localQuery = localQuery.eq('state', state);
    }

    const { data: localResults } = await localQuery;

    // Search ProPublica for additional results
    let propublicaResults: any[] = [];
    try {
      const ppResults = await searchOrganizations(query, state);
      propublicaResults = (ppResults.organizations || [])
        .slice(0, 10)
        .map((org) => {
          const converted = convertToCharity(org);
          return {
            ein: converted.ein,
            name: converted.name,
            city: converted.city,
            state: converted.state,
            sector: converted.sector,
            annual_revenue: converted.annual_revenue,
            source: 'propublica' as const,
          };
        });
    } catch {
      // ProPublica search failed — return only local results
    }

    // Merge and deduplicate by EIN
    const seenEINs = new Set<string>();
    const results: any[] = [];

    // Local results first (higher priority — already in our DB)
    for (const r of localResults || []) {
      if (r.ein && !seenEINs.has(r.ein)) {
        seenEINs.add(r.ein);
        results.push({ ...r, source: 'local' });
      }
    }

    // Then ProPublica results
    for (const r of propublicaResults) {
      if (r.ein && !seenEINs.has(r.ein)) {
        seenEINs.add(r.ein);
        results.push(r);
      }
    }

    return NextResponse.json({
      results,
      total: results.length,
    }, { headers: NO_STORE });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500, headers: NO_STORE }
    );
  }
}
