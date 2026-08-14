

// app/api/portfolio/[id]/widgets/[widgetId]/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/api/server-client';
import { updateWidgetSchema } from '@/lib/schemas/portfolio';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createServerClient;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; widgetId: string }> }) {
  const { id: portfolio_id, widgetId } = await ctx.params;
  const sb = await createSb();

  // Permission gate
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const validation = updateWidgetSchema.safeParse(body);
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
  if (validated.type !== undefined) patch.type = validated.type;
  if (validated.title !== undefined) patch.title = validated.title;
  if (validated.config !== undefined) patch.config = validated.config;
  if (validated.position !== undefined) patch.position = validated.position;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data, error } = await sb
    .from('widgets')
    .update(patch)
    .eq('id', widgetId)
    .eq('portfolio_id', portfolio_id)
    .select('id, portfolio_id, type, title, config, position')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; widgetId: string }> }) {
  const { id: portfolio_id, widgetId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('widgets')
    .delete()
    .eq('id', widgetId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}
