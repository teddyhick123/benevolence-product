// app/api/portfolio/[id]/analytics/projections/route.ts
import { NextResponse } from 'next/server';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import type { PortfolioAccessContext } from '@/lib/api/principals';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

async function portfolioHoldingIds(sb: PortfolioAccessContext['db'], portfolioId: string, holdingId?: string | null) {
  let query = sb
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .is('deleted_at', null);

  if (holdingId) {
    query = query.eq('id', holdingId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((holding: { id: string }) => holding.id);
}

async function cacheProjection(
  sb: PortfolioAccessContext['db'],
  payload: {
    portfolio_id: string;
    holding_id: string | null;
    metric_code: string;
    method: string;
    periods_ahead: number;
    historical_data_points: number;
    trend_direction: string;
    slope_per_period: number | null;
    r_squared: number | null;
    projections: unknown[];
    expires_at: string;
    is_stale: boolean;
  }
) {
  const { data: existing } = await sb
    .from('metric_projections_cache')
    .select('id')
    .eq('portfolio_id', payload.portfolio_id)
    .eq('metric_code', payload.metric_code)
    .eq('method', payload.method)
    .eq('periods_ahead', payload.periods_ahead)
    .is('holding_id', payload.holding_id)
    .maybeSingle();

  if (existing?.id) {
    await sb
      .from('metric_projections_cache')
      .update(payload)
      .eq('id', existing.id);
    return;
  }

  await sb.from('metric_projections_cache').insert(payload);
}

// Helper to calculate time range
function getTimeRangeStart(range: string): string {
  const now = new Date();
  switch (range) {
    case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    case '24m': return new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString();
    default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
  }
}

// Linear regression projection
function linearProjection(values: number[], periodsAhead: number) {
  const n = values.length;
  if (n < 2) return null;

  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  const ssTot = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
  const ssRes = values.reduce((sum, y, x) => sum + Math.pow(y - (intercept + slope * x), 2), 0);
  const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

  // Standard deviation for confidence intervals
  const stdDev = Math.sqrt(ssRes / Math.max(1, n - 2));

  const projections = [];
  for (let i = 1; i <= periodsAhead; i++) {
    const projectedValue = intercept + slope * (n - 1 + i);
    const confidenceMargin = stdDev * 1.96 * Math.sqrt(1 + 1/n + Math.pow(i, 2) / Math.max(1, sumX2));

    projections.push({
      period_offset: i,
      projected_value: Math.max(0, projectedValue),
      confidence_low: Math.max(0, projectedValue - confidenceMargin),
      confidence_high: projectedValue + confidenceMargin,
    });
  }

  return {
    slope,
    intercept,
    r_squared: rSquared,
    trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
    projections,
  };
}

// Moving average projection
function movingAverageProjection(values: number[], periodsAhead: number, windowSize: number = 3) {
  const n = values.length;
  if (n < windowSize) return null;

  const lastWindow = values.slice(-windowSize);
  const avg = lastWindow.reduce((a, b) => a + b, 0) / windowSize;

  // Calculate variance for confidence
  const variance = lastWindow.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / windowSize;
  const stdDev = Math.sqrt(variance);

  const projections = [];
  for (let i = 1; i <= periodsAhead; i++) {
    projections.push({
      period_offset: i,
      projected_value: avg,
      confidence_low: Math.max(0, avg - stdDev * 1.96),
      confidence_high: avg + stdDev * 1.96,
    });
  }

  return {
    window_size: windowSize,
    trend: 'stable',
    projections,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;
  const url = new URL(req.url);

  const metric_code = url.searchParams.get('metric_code');
  const holding_id = url.searchParams.get('holding_id');
  const method = url.searchParams.get('method') || 'linear';
  const periods_ahead = parseInt(url.searchParams.get('periods_ahead') || '4');
  const time_range = url.searchParams.get('time_range') || 'all';

  if (!metric_code) {
    return NextResponse.json({ error: 'metric_code is required' }, { status: 400, headers: cacheHeaders() });
  }

  const sb = access.context.db;

  // Check cache first
  const { data: cached } = await sb
    .from('metric_projections_cache')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('metric_code', metric_code)
    .eq('method', method)
    .eq('periods_ahead', periods_ahead)
    .eq('is_stale', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached && !holding_id) {
    return NextResponse.json({
      projection: {
        metric_code,
        method,
        ...cached,
        from_cache: true,
      },
    }, { headers: cacheHeaders() });
  }

  let holdingIds: string[];
  try {
    holdingIds = await portfolioHoldingIds(sb, portfolio_id, holding_id);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  if (holdingIds.length === 0) {
    return NextResponse.json({
      error: holding_id ? 'Holding not found' : 'Not enough historical data for projection',
      data_points: 0,
      minimum_required: 2,
    }, { status: holding_id ? 404 : 200, headers: cacheHeaders() });
  }

  // Fetch historical data
  let query = sb
    .from('metric_facts')
    .select('value, period_start, period_end')
    .in('holding_id', holdingIds)
    .eq('metric_code', metric_code.toUpperCase())
    .order('period_start', { ascending: true });

  if (holding_id) {
    query = query.eq('holding_id', holding_id);
  }

  if (time_range !== 'all') {
    query = query.gte('period_start', getTimeRangeStart(time_range));
  }

  const { data: historicalData, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  if (!historicalData || historicalData.length < 2) {
    return NextResponse.json({
      error: 'Not enough historical data for projection',
      data_points: historicalData?.length || 0,
      minimum_required: 2,
    }, { headers: cacheHeaders() });
  }

  const values = historicalData.map((d: any) => Number(d.value));
  const periods = historicalData.map((d: any) => d.period_end || d.period_start);

  let result;
  if (method === 'moving_average') {
    result = movingAverageProjection(values, periods_ahead);
  } else {
    result = linearProjection(values, periods_ahead);
  }

  if (!result) {
    return NextResponse.json({ error: 'Projection calculation failed' }, { status: 500, headers: cacheHeaders() });
  }

  // Add actual period dates to projections
  const lastPeriod = new Date(periods[periods.length - 1]);
  result.projections = result.projections.map((p: any) => {
    const projectedDate = new Date(lastPeriod);
    projectedDate.setMonth(projectedDate.getMonth() + 3 * p.period_offset); // Assume quarterly
    return {
      ...p,
      period: projectedDate.toISOString().split('T')[0],
    };
  });

  // Cache the result (for portfolio-wide projections only)
  if (!holding_id) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 6); // Cache for 6 hours

    await cacheProjection(sb, {
      portfolio_id,
      holding_id: null,
      metric_code,
      method,
      periods_ahead,
      historical_data_points: values.length,
      trend_direction: result.trend,
      slope_per_period: 'slope' in result ? result.slope : null,
      r_squared: 'r_squared' in result ? result.r_squared : null,
      projections: result.projections,
      expires_at: expiresAt.toISOString(),
      is_stale: false,
    });
  }

  return NextResponse.json({
    projection: {
      metric_code,
      method,
      holding_id: holding_id || null,
      historical_data_points: values.length,
      historical_range: {
        start: periods[0],
        end: periods[periods.length - 1],
      },
      ...result,
      from_cache: false,
    },
  }, { headers: cacheHeaders() });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) return access.response;
  const sb = access.context.db;

  const body = await req.json();
  const { metric_codes, holding_id, method = 'linear', periods_ahead = 4 } = body;

  if (!metric_codes || !Array.isArray(metric_codes) || metric_codes.length === 0) {
    return NextResponse.json({ error: 'metric_codes array is required' }, { status: 400, headers: cacheHeaders() });
  }

  const results = [];
  let holdingIds: string[];
  try {
    holdingIds = await portfolioHoldingIds(sb, portfolio_id, holding_id);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  if (holdingIds.length === 0) {
    return NextResponse.json({
      projections: metric_codes.map((metric_code: string) => ({
        metric_code,
        error: holding_id ? 'Holding not found' : 'Not enough data',
        data_points: 0,
      })),
    }, { status: holding_id ? 404 : 200, headers: cacheHeaders() });
  }

  for (const metric_code of metric_codes) {
    let query = sb
      .from('metric_facts')
      .select('value, period_start, period_end')
      .in('holding_id', holdingIds)
      .eq('metric_code', metric_code.toUpperCase())
      .order('period_start', { ascending: true });

    if (holding_id) {
      query = query.eq('holding_id', holding_id);
    }

    const { data: historicalData } = await query;

    if (!historicalData || historicalData.length < 2) {
      results.push({
        metric_code,
        error: 'Not enough data',
        data_points: historicalData?.length || 0,
      });
      continue;
    }

    const values = historicalData.map((d: any) => Number(d.value));
    const periods = historicalData.map((d: any) => d.period_end || d.period_start);

    const result = method === 'moving_average'
      ? movingAverageProjection(values, periods_ahead)
      : linearProjection(values, periods_ahead);

    if (result) {
      const lastPeriod = new Date(periods[periods.length - 1]);
      result.projections = result.projections.map((p: any) => {
        const projectedDate = new Date(lastPeriod);
        projectedDate.setMonth(projectedDate.getMonth() + 3 * p.period_offset);
        return { ...p, period: projectedDate.toISOString().split('T')[0] };
      });

      results.push({
        metric_code,
        method,
        historical_data_points: values.length,
        ...result,
      });
    }
  }

  return NextResponse.json({ projections: results }, { headers: cacheHeaders() });
}
