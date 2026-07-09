// app/api/portfolio/[id]/reports/documents/[documentId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders(isGet = false) {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: portfolio_id, documentId } = await ctx.params;
  const sb = await createSb();

  const { data: document, error } = await sb
    .from('generated_documents')
    .select(`
      *,
      report_templates (name, scope, config),
      holdings (name, sector)
    `)
    .eq('id', documentId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ document }, { headers: cacheHeaders(true) });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: portfolio_id, documentId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const body = await req.json();
  const { title, is_public, expires_at, status } = body;

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (is_public !== undefined) {
    updates.is_public = is_public;
    // Generate share token if making public
    if (is_public) {
      const { data: currentDoc } = await sb
        .from('generated_documents')
        .select('share_token')
        .eq('id', documentId)
        .single();

      if (!currentDoc?.share_token) {
        const { data: token } = await sb.rpc('generate_share_token');
        updates.share_token = token;
      }
    }
  }
  if (expires_at !== undefined) updates.expires_at = expires_at;
  if (status !== undefined) {
    if (!['generated', 'archived'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be generated or archived' },
        { status: 400, headers: cacheHeaders() }
      );
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data: document, error } = await sb
    .from('generated_documents')
    .update(updates)
    .eq('id', documentId)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: cacheHeaders() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ document }, { headers: cacheHeaders() });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: portfolio_id, documentId } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Soft delete by archiving
  const { error } = await sb
    .from('generated_documents')
    .update({ status: 'archived' })
    .eq('id', documentId)
    .eq('portfolio_id', portfolio_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ success: true }, { headers: cacheHeaders() });
}
