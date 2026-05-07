// app/api/portfolio/[id]/reports/documents/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders(isGet = false) {
  return isGet
    ? { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15' } as const
    : { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const document_type = url.searchParams.get('type');
  const format = url.searchParams.get('format');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 100);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;

  const sb = await createSb();

  let query = sb
    .from('generated_documents')
    .select(`
      id,
      title,
      document_type,
      format,
      scope,
      status,
      is_public,
      share_token,
      file_size_bytes,
      generated_at,
      expires_at,
      template_id,
      holding_id,
      sector,
      report_templates (name),
      holdings (name)
    `, { count: 'exact' })
    .eq('portfolio_id', portfolio_id)
    .neq('status', 'archived')
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (document_type) {
    query = query.eq('document_type', document_type);
  }
  if (format) {
    query = query.eq('format', format);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  // Flatten nested relations
  const documents = (data ?? []).map((doc: any) => ({
    ...doc,
    template_name: doc.report_templates?.name,
    holding_name: doc.holdings?.name,
    report_templates: undefined,
    holdings: undefined,
  }));

  return NextResponse.json({
    documents,
    count: count ?? 0,
    nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
  }, { headers: cacheHeaders(true) });
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
  const {
    title,
    document_type,
    format,
    scope,
    content,
    config,
    template_id,
    holding_id,
    sector,
    is_public,
    expires_at,
  } = body;

  if (!title || !document_type || !format || !scope) {
    return NextResponse.json(
      { error: 'title, document_type, format, and scope are required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  // Generate share token if public
  let share_token = null;
  if (is_public) {
    const { data: token } = await sb.rpc('generate_share_token');
    share_token = token;
  }

  const { data: document, error } = await sb
    .from('generated_documents')
    .insert({
      portfolio_id,
      title,
      document_type,
      format,
      scope,
      content: content || {},
      config: config || {},
      template_id: template_id || null,
      holding_id: holding_id || null,
      sector: sector || null,
      is_public: is_public || false,
      share_token,
      expires_at: expires_at || null,
      generated_by: user?.id,
      status: 'generated',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ document }, { status: 201, headers: cacheHeaders() });
}
