// app/api/portfolio/[id]/reports/schedules/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const active_only = url.searchParams.get('active_only') === 'true';

  const sb = await createSb();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', { p_portfolio_id: portfolio_id });
  if (canViewErr) return NextResponse.json({ error: canViewErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canView) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let query = sb
    .from('report_schedules')
    .select(`
      id,
      name,
      frequency,
      day_of_week,
      day_of_month,
      time_of_day,
      timezone,
      delivery_method,
      recipients,
      is_active,
      last_run_at,
      next_run_at,
      run_count,
      last_error,
      template_id,
      report_templates (name, scope),
      created_at
    `)
    .eq('portfolio_id', portfolio_id)
    .order('created_at', { ascending: false });

  if (active_only) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  const schedules = (data ?? []).map((s: any) => ({
    ...s,
    template_name: s.report_templates?.name,
    template_scope: s.report_templates?.scope,
    report_templates: undefined,
  }));

  return NextResponse.json({ schedules }, { headers: cacheHeaders() });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { data: { user } } = await sb.auth.getUser();

  const body = await req.json();
  const {
    name,
    template_id,
    frequency,
    day_of_week,
    day_of_month,
    time_of_day,
    timezone,
    delivery_method,
    recipients,
    is_active,
  } = body;

  if (!name || !template_id || !frequency) {
    return NextResponse.json(
      { error: 'name, template_id, and frequency are required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  if (!['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) {
    return NextResponse.json(
      { error: 'frequency must be daily, weekly, monthly, quarterly, or yearly' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  // Verify template exists
  const { data: template, error: templateErr } = await sb
    .from('report_templates')
    .select('id')
    .eq('id', template_id)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (templateErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404, headers: cacheHeaders() });
  }

  const { data: schedule, error } = await sb
    .from('report_schedules')
    .insert({
      portfolio_id,
      name,
      template_id,
      frequency,
      day_of_week: day_of_week ?? null,
      day_of_month: day_of_month ?? null,
      time_of_day: time_of_day || '09:00:00',
      timezone: timezone || 'America/New_York',
      delivery_method: delivery_method || 'store',
      recipients: recipients || [],
      is_active: is_active !== false,
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ schedule }, { status: 201, headers: cacheHeaders() });
}
