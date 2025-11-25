// app/api/portfolio/[id]/kpis/[kpiId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateKpiSchema } from '@/lib/schemas/portfolio';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

function toIso(v: any): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toDate(v: any): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; kpiId: string }> }) {
  const { id: portfolio_id, kpiId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
    // Handle legacy 'label' field
    if (body.label && !body.display_name) {
      body.display_name = body.label;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const validation = updateKpiSchema.safeParse(body);
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

  // Build patch object from validated data
  const patch: Record<string, any> = {};
  if (validated.display_name !== undefined) patch.display_name = validated.display_name;
  if (validated.metric_code !== undefined) patch.metric_code = validated.metric_code;
  if (validated.target_value !== undefined) patch.target_value = validated.target_value;
  if (validated.target_date !== undefined) patch.target_date = validated.target_date;
  if (validated.order_index !== undefined) patch.order_index = validated.order_index;
  if (validated.calculation !== undefined) patch.calculation = validated.calculation;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data: definition, error: updateError } = await sb
    .from('kpi_definitions')
    .update(patch)
    .eq('id', kpiId)
    .eq('portfolio_id', portfolio_id)
    .select('id, portfolio_id, display_name, metric_code, target_value, target_date, calculation, order_index')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: cacheHeaders() });

  const { data: latest, error: latestError } = await sb
    .from('v_portfolio_kpi_latest')
    .select('kpi_def_id, value, unit, period_start, period_end')
    .eq('kpi_def_id', kpiId)
    .eq('portfolio_id', portfolio_id)
    .maybeSingle();

  if (latestError && latestError.code !== 'PGRST116') {
    // PGRST116 = no rows found, treat as null latest
    return NextResponse.json({ error: latestError.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ definition, latest: latest || null }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; kpiId: string }> }) {
  const { id: portfolio_id, kpiId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('kpi_definitions')
    .delete()
    .eq('id', kpiId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}