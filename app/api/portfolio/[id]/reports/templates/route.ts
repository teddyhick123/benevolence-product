// app/api/portfolio/[id]/reports/templates/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/api/server-client';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');

  const sb = await createSb();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', { p_portfolio_id: portfolio_id });
  if (canViewErr) return NextResponse.json({ error: canViewErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canView) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let query = sb
    .from('report_templates')
    .select('id, name, description, scope, config, is_default, created_at, updated_at')
    .eq('portfolio_id', portfolio_id)
    .order('created_at', { ascending: false });

  if (scope) {
    query = query.eq('scope', scope);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ templates: data ?? [] }, { headers: cacheHeaders() });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Get current user
  const { data: { user } } = await sb.auth.getUser();

  const body = await req.json();
  const { name, description, scope, config, is_default } = body;

  if (!name || !scope || !config) {
    return NextResponse.json(
      { error: 'name, scope, and config are required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  if (!['portfolio', 'holding', 'sector'].includes(scope)) {
    return NextResponse.json(
      { error: 'scope must be portfolio, holding, or sector' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  const { data: template, error } = await sb
    .from('report_templates')
    .insert({
      portfolio_id,
      name,
      description: description || null,
      scope,
      config,
      is_default: is_default || false,
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ template }, { status: 201, headers: cacheHeaders() });
}
