import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const getSupabase = createSupabaseServerClient;

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]
 * Get a specific document
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string; documentId: string }> }
) {
  const { id: portfolioId, contributionId, documentId } = await ctx.params;
  const supabase = await getSupabase();

  // Check permission via RLS
  const { data: portfolio, error: permError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .single();

  if (permError || !portfolio) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch document
  const { data, error } = await supabase
    .from('tax_documents')
    .select('*')
    .eq('id', documentId)
    .eq('portfolio_id', portfolioId)
    .eq('tax_contribution_id', contributionId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Get signed URL for viewing
  const { data: urlData } = await supabase.storage
    .from('tax-documents')
    .createSignedUrl(data.storage_path, 3600); // 1 hour expiry

  return NextResponse.json({
    data: {
      ...data,
      signed_url: urlData?.signedUrl,
    },
  });
}

/**
 * DELETE /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]
 * Delete a document
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string; documentId: string }> }
) {
  const { id: portfolioId, contributionId, documentId } = await ctx.params;
  const supabase = await getSupabase();

  // Check edit permission
  const { data: canEdit, error: permError } = await supabase.rpc(
    'can_edit_portfolio',
    { p_portfolio_id: portfolioId }
  );

  if (permError || !canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch document to get storage path
  const { data: doc, error: fetchError } = await supabase
    .from('tax_documents')
    .select('storage_path, document_type')
    .eq('id', documentId)
    .eq('portfolio_id', portfolioId)
    .eq('tax_contribution_id', contributionId)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('tax-documents')
    .remove([doc.storage_path]);

  if (storageError) {
    console.error('Storage delete error:', storageError);
    // Continue anyway - we still want to remove the database record
  }

  // Delete database record
  const { error: deleteError } = await supabase
    .from('tax_documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Clear the storage path field on contribution if applicable
  const updateField = getStoragePathField(doc.document_type);
  if (updateField) {
    // Check if there are other documents of this type
    const { data: otherDocs } = await supabase
      .from('tax_documents')
      .select('id')
      .eq('tax_contribution_id', contributionId)
      .eq('document_type', doc.document_type)
      .limit(1);

    if (!otherDocs || otherDocs.length === 0) {
      // No other documents of this type, clear the field
      await supabase
        .from('tax_contributions')
        .update({ [updateField]: null })
        .eq('id', contributionId);
    }
  }

  return NextResponse.json({ success: true });
}

function getStoragePathField(docType: string): string | null {
  switch (docType) {
    case 'receipt':
      return 'receipt_storage_path';
    case 'acknowledgment':
      return 'acknowledgment_storage_path';
    case 'appraisal':
      return 'appraisal_storage_path';
    default:
      return null;
  }
}
