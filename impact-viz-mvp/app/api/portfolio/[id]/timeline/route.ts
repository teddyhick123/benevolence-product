// app/api/portfolio/[id]/timeline/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(_req.url);
  const holdingId = url.searchParams.get('holdingId');
  const eventTypesParam = url.searchParams.get('eventTypes');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const supabase = await createSupabaseServerClient();

  // Get all holdings for this portfolio to map holding IDs to names
  const { data: holdings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('id, name')
    .eq('portfolio_id', portfolioId);

  if (holdingsErr) {
    return NextResponse.json(
      { error: holdingsErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const holdingMap = new Map((holdings || []).map(h => [h.id, h.name]));
  const holdingIds = Array.from(holdingMap.keys());

  // Collect timeline events from multiple sources
  const events: any[] = [];

  // 1. Events from events table (if it exists and has investee_id)
  const { data: dbEvents } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false });

  if (dbEvents) {
    for (const evt of dbEvents) {
      // Check if this event is related to a holding in this portfolio
      if (evt.investee_id) {
        const { data: relatedHoldings } = await supabase
          .from('holdings')
          .select('id, name')
          .eq('investee_id', evt.investee_id)
          .eq('portfolio_id', portfolioId);

        if (relatedHoldings && relatedHoldings.length > 0) {
          const holding = relatedHoldings[0];
          events.push({
            id: `event-${evt.id}`,
            date: evt.event_date,
            title: evt.headline || 'Event',
            description: evt.source_link || undefined,
            type: evt.severity === 'high' ? 'milestone' : 'other',
            holdingId: holding.id,
            holdingName: holding.name
          });
        }
      }
    }
  }

  // 2. Funding events from holding_contributions
  const { data: contributions } = await supabase
    .from('holding_contributions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('contributed_at', { ascending: false });

  if (contributions) {
    for (const contrib of contributions) {
      const holdingName = holdingMap.get(contrib.holding_id);
      if (holdingName) {
        events.push({
          id: `contribution-${contrib.id}`,
          date: contrib.contributed_at.split('T')[0], // Extract date only
          title: contrib.memo || 'Funding Contribution',
          description: contrib.source || undefined,
          type: 'funding',
          value: Number(contrib.amount) || 0,
          unit: 'USD',
          holdingId: contrib.holding_id,
          holdingName
        });
      }
    }
  }

  // 3. Metric milestones (significant metric achievements)
  // Find holdings with recent metric changes that could be milestones
  if (holdingIds.length > 0) {
    const { data: metrics } = await supabase
      .from('metric_facts')
      .select('holding_id, metric_code, period_end, value, unit')
      .in('holding_id', holdingIds)
      .order('period_end', { ascending: false })
      .limit(50); // Get recent metrics

    if (metrics) {
      // Group by holding and metric to find first occurrence (milestone)
      const seen = new Set<string>();
      for (const m of metrics) {
        const key = `${m.holding_id}-${m.metric_code}`;
        if (!seen.has(key) && m.value && Number(m.value) > 0) {
          seen.add(key);
          const holdingName = holdingMap.get(m.holding_id);

          // Only add as milestone if value is significant (>= 100)
          if (holdingName && Number(m.value) >= 100) {
            events.push({
              id: `metric-${m.holding_id}-${m.metric_code}-${m.period_end}`,
              date: m.period_end,
              title: `${m.metric_code} Milestone`,
              description: `Achieved ${Number(m.value).toLocaleString()} ${m.unit || ''}`,
              type: 'metric',
              value: Number(m.value) || 0,
              unit: m.unit || undefined,
              holdingId: m.holding_id,
              holdingName
            });
          }
        }
      }
    }
  }

  // Filter by criteria
  let filteredEvents = events;

  // Filter by holding
  if (holdingId) {
    filteredEvents = filteredEvents.filter(e => e.holdingId === holdingId);
  }

  // Filter by event types
  if (eventTypesParam) {
    const types = eventTypesParam.split(',').map(t => t.trim());
    filteredEvents = filteredEvents.filter(e => types.includes(e.type));
  }

  // Filter by date range
  if (startDate) {
    filteredEvents = filteredEvents.filter(e => e.date >= startDate);
  }
  if (endDate) {
    filteredEvents = filteredEvents.filter(e => e.date <= endDate);
  }

  // Sort by date (newest first)
  filteredEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(
    { data: filteredEvents },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
