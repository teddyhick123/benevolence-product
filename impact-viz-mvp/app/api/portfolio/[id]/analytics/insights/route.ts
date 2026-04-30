// app/api/portfolio/[id]/analytics/insights/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

function cacheHeaders(isGet = false) {
  return isGet
    ? { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } as const
    : { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const url = new URL(req.url);

  const category = url.searchParams.get('category');
  const severity = url.searchParams.get('severity');
  const active_only = url.searchParams.get('active_only') !== 'false';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  const sb = await createSb();

  let query = sb
    .from('analytics_insights')
    .select(`
      *,
      holdings (name, sector)
    `)
    .eq('portfolio_id', portfolio_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (active_only) {
    query = query.eq('is_active', true);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data: insights, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  // Transform insights
  const transformedInsights = (insights || []).map((i: any) => ({
    ...i,
    holding_name: i.holdings?.name,
    holding_sector: i.holdings?.sector,
    holdings: undefined,
  }));

  // Get summary counts
  const { data: summaryCounts } = await sb
    .from('analytics_insights')
    .select('severity, category')
    .eq('portfolio_id', portfolio_id)
    .eq('is_active', true);

  const summary = {
    total_active: summaryCounts?.length || 0,
    by_severity: {
      critical: summaryCounts?.filter(i => i.severity === 'critical').length || 0,
      high: summaryCounts?.filter(i => i.severity === 'high').length || 0,
      medium: summaryCounts?.filter(i => i.severity === 'medium').length || 0,
      low: summaryCounts?.filter(i => i.severity === 'low').length || 0,
      info: summaryCounts?.filter(i => i.severity === 'info').length || 0,
    },
    by_category: {} as Record<string, number>,
  };

  summaryCounts?.forEach(i => {
    summary.by_category[i.category] = (summary.by_category[i.category] || 0) + 1;
  });

  return NextResponse.json({
    insights: transformedInsights,
    summary,
  }, { headers: cacheHeaders(true) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const sb = await createSb();

  const body = await req.json();
  const {
    holding_id,
    insight_type,
    category,
    title,
    description,
    severity,
    metric_code,
    metric_value,
    comparison_value,
    change_percent,
    data_context,
    suggested_actions,
    expires_at,
  } = body;

  if (!insight_type || !category || !title || !description) {
    return NextResponse.json(
      { error: 'insight_type, category, title, and description are required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  const { data: insight, error } = await sb
    .from('analytics_insights')
    .insert({
      portfolio_id,
      holding_id: holding_id || null,
      insight_type,
      category,
      title,
      description,
      severity: severity || 'info',
      metric_code: metric_code || null,
      metric_value: metric_value || null,
      comparison_value: comparison_value || null,
      change_percent: change_percent || null,
      data_context: data_context || {},
      suggested_actions: suggested_actions || [],
      expires_at: expires_at || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ insight }, { status: 201, headers: cacheHeaders() });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const sb = await createSb();

  const body = await req.json();
  const { insight_id, action } = body;

  if (!insight_id || !action) {
    return NextResponse.json(
      { error: 'insight_id and action are required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  const { data: { user } } = await sb.auth.getUser();

  let updates: Record<string, any> = {};

  switch (action) {
    case 'dismiss':
      updates = {
        is_active: false,
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id,
      };
      break;
    case 'action_taken':
      updates = {
        action_taken: true,
        action_taken_at: new Date().toISOString(),
      };
      break;
    case 'reactivate':
      updates = {
        is_active: true,
        dismissed_at: null,
        dismissed_by: null,
      };
      break;
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: cacheHeaders() });
  }

  const { data: insight, error } = await sb
    .from('analytics_insights')
    .update(updates)
    .eq('id', insight_id)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ insight }, { headers: cacheHeaders() });
}
