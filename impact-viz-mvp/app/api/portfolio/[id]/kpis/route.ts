// app/api/portfolio/[id]/kpis/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createKpiSchema } from '@/lib/schemas/portfolio';
import { validateRequest } from '@/lib/validation';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const sb = await createSb();

  const { data: defs, count, error } = await sb
    .from('kpi_definitions')
    .select(
      'id, portfolio_id, display_name, metric_code, target_value, target_date, calculation, order_index',
      { count: 'exact' }
    )
    .eq('portfolio_id', portfolio_id)
    .order('order_index', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  let combined = defs ?? [];
  if (combined.length) {
    const ids = combined.map((d: any) => d.id);
    const { data: latestRows, error: latestErr } = await sb
      .from('v_portfolio_kpi_latest')
      .select('kpi_def_id, value, unit, period_start, period_end')
      .eq('portfolio_id', portfolio_id)
      .in('kpi_def_id', ids);

    if (latestErr) {
      return NextResponse.json({ error: latestErr.message }, { status: 500, headers: cacheHeaders() });
    }

    const byId = new Map<string, any>();
    for (const r of latestRows ?? []) byId.set(r.kpi_def_id, { value: r.value, unit: r.unit, period_start: r.period_start, period_end: r.period_end });
    combined = combined.map((d: any) => ({ ...d, latest: byId.get(d.id) ?? null }));
  }

  return NextResponse.json(
    {
      data: combined,
      count: count ?? 0,
      nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    { headers: cacheHeaders() }
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission gate
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
    // Handle legacy 'label' field - transform to 'display_name'
    if (body.label && !body.display_name) {
      body.display_name = body.label;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const validation = createKpiSchema.safeParse(body);
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

  const insertRow: any = {
    portfolio_id,
    display_name: validated.display_name,
    metric_code: validated.metric_code ?? null,
    target_value: validated.target_value ?? null,
    target_date: validated.target_date ?? null,
    order_index: validated.order_index ?? null,
    calculation: validated.calculation ?? null,
  };

  const { data: inserted, error: insErr } = await sb
    .from('kpi_definitions')
    .insert(insertRow)
    .select(`id, portfolio_id, display_name, metric_code, target_value, target_date, order_index, calculation`)
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: cacheHeaders() });

  const { data: latest, error: latestErr } = await sb
    .from('v_portfolio_kpi_latest')
    .select('value, unit, period_start, period_end')
    .eq('kpi_def_id', inserted.id)
    .maybeSingle();

  if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500, headers: cacheHeaders() });

  return NextResponse.json({ definition: inserted, latest }, { headers: cacheHeaders() });
}