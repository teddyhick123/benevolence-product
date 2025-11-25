// app/api/portfolio/[id]/holdings/[holdingId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateHoldingSchema } from '@/lib/schemas/portfolio';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  // Permission gate — clearer error than raw RLS
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
    // Handle legacy field names before validation
    if (body.nav !== undefined && body.funds_allocated === undefined) {
      body.funds_allocated = body.nav;
    }
    if (body.as_of_date !== undefined && body.as_of === undefined) {
      body.as_of = body.as_of_date;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const validation = updateHoldingSchema.safeParse(body);
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

  // Build patch object from validated data (only include provided fields)
  const patch: Record<string, any> = {};
  if (validated.name !== undefined) patch.name = validated.name;
  if (validated.status !== undefined) patch.status = validated.status;
  if (validated.asset_class !== undefined) patch.asset_class = validated.asset_class;
  if (validated.custodian !== undefined) patch.custodian = validated.custodian;
  if (validated.valuation_method !== undefined) patch.valuation_method = validated.valuation_method;
  if (validated.sector !== undefined) patch.sector = validated.sector;
  if (validated.country !== undefined) patch.country = validated.country;
  if (validated.investee_id !== undefined) patch.investee_id = validated.investee_id;
  if (validated.funds_allocated !== undefined) patch.funds_allocated = validated.funds_allocated;
  if (validated.as_of !== undefined) patch.as_of = validated.as_of;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { error: updErr } = await sb
    .from('holdings')
    .update(patch)
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500, headers: cacheHeaders() });

  const { data, error: fetchErr } = await sb
    .from('v_holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      name,
      status,
      asset_class,
      funds_allocated,
      as_of,
      sector,
      country,
      custodian,
      valuation_method,
      created_at,
      updated_at
    `)
    .eq('id', holdingId)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return new Response(null, { status: 204, headers: cacheHeaders() });
}