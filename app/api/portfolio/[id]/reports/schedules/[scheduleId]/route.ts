// app/api/portfolio/[id]/reports/schedules/[scheduleId]/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/api/server-client';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createServerClient;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { id: portfolio_id, scheduleId } = await ctx.params;
  const sb = await createSb();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', { p_portfolio_id: portfolio_id });
  if (canViewErr) return NextResponse.json({ error: canViewErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canView) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { data: schedule, error } = await sb
    .from('report_schedules')
    .select(`
      *,
      report_templates (name, scope, config)
    `)
    .eq('id', scheduleId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ schedule }, { headers: cacheHeaders() });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { id: portfolio_id, scheduleId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const body = await req.json();
  const {
    name,
    frequency,
    day_of_week,
    day_of_month,
    time_of_day,
    timezone,
    delivery_method,
    recipients,
    is_active,
  } = body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (frequency !== undefined) {
    if (!['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) {
      return NextResponse.json(
        { error: 'frequency must be daily, weekly, monthly, quarterly, or yearly' },
        { status: 400, headers: cacheHeaders() }
      );
    }
    updates.frequency = frequency;
  }
  if (day_of_week !== undefined) updates.day_of_week = day_of_week;
  if (day_of_month !== undefined) updates.day_of_month = day_of_month;
  if (time_of_day !== undefined) updates.time_of_day = time_of_day;
  if (timezone !== undefined) updates.timezone = timezone;
  if (delivery_method !== undefined) {
    if (!['store', 'email', 'both'].includes(delivery_method)) {
      return NextResponse.json(
        { error: 'delivery_method must be store, email, or both' },
        { status: 400, headers: cacheHeaders() }
      );
    }
    updates.delivery_method = delivery_method;
  }
  if (recipients !== undefined) updates.recipients = recipients;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  // If frequency changes, force next_run_at recalculation by setting to null
  if (updates.frequency || updates.day_of_week !== undefined || updates.day_of_month !== undefined || updates.time_of_day) {
    updates.next_run_at = null;
  }

  const { data: schedule, error } = await sb
    .from('report_schedules')
    .update(updates)
    .eq('id', scheduleId)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ schedule }, { headers: cacheHeaders() });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { id: portfolio_id, scheduleId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('report_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('portfolio_id', portfolio_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ success: true }, { headers: cacheHeaders() });
}
