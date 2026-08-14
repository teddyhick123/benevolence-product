// app/api/portfolio/[id]/reports/templates/[templateId]/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/api/server-client';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createServerClient;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> }
) {
  const { id: portfolio_id, templateId } = await ctx.params;
  const sb = await createSb();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', { p_portfolio_id: portfolio_id });
  if (canViewErr) return NextResponse.json({ error: canViewErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canView) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { data: template, error } = await sb
    .from('report_templates')
    .select('*')
    .eq('id', templateId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Template not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ template }, { headers: cacheHeaders() });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> }
) {
  const { id: portfolio_id, templateId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const body = await req.json();
  const { name, description, scope, config, is_default } = body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (scope !== undefined) {
    if (!['portfolio', 'holding', 'sector'].includes(scope)) {
      return NextResponse.json(
        { error: 'scope must be portfolio, holding, or sector' },
        { status: 400, headers: cacheHeaders() }
      );
    }
    updates.scope = scope;
  }
  if (config !== undefined) updates.config = config;
  if (is_default !== undefined) updates.is_default = is_default;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data: template, error } = await sb
    .from('report_templates')
    .update(updates)
    .eq('id', templateId)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Template not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ template }, { headers: cacheHeaders() });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> }
) {
  const { id: portfolio_id, templateId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('report_templates')
    .delete()
    .eq('id', templateId)
    .eq('portfolio_id', portfolio_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ success: true }, { headers: cacheHeaders() });
}
