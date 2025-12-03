import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]
 * Get a single document with signed URL for viewing
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string; documentId: string }> }
) {
  const { id: portfolio_id, contributionId: contribution_id, documentId: doc_id } = await ctx.params;
  const sb = await supabasePublic();

  try {
    // Fetch document
    const { data: document, error } = await sb
      .from('tax_documents')
      .select('*')
      .eq('id', doc_id)
      .eq('tax_contribution_id', contribution_id)
      .single();

    if (error) {
      throw error;
    }

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Generate signed URL for private access (valid for 1 hour)
    const { data: signedData } = await sb.storage
      .from('tax-documents')
      .createSignedUrl(document.storage_path, 3600);

    return NextResponse.json(
      {
        data: {
          ...document,
          signed_url: signedData?.signedUrl,
        },
      },
      { headers: { 'Cache-Control': 'private, max-age=3600' } }
    );
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * DELETE /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]
 * Delete a document
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string; documentId: string }> }
) {
  const { id: portfolio_id, contributionId: contribution_id, documentId: doc_id } = await ctx.params;
  const sb = await supabasePublic();

  // Check permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Fetch document to get storage path
    const { data: document, error: fetchError } = await sb
      .from('tax_documents')
      .select('*')
      .eq('id', doc_id)
      .eq('tax_contribution_id', contribution_id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Delete from storage
    const { error: storageError } = await sb.storage
      .from('tax-documents')
      .remove([document.storage_path]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continue anyway to delete database record
    }

    // Delete database record
    const { error: deleteError } = await sb
      .from('tax_documents')
      .delete()
      .eq('id', doc_id);

    if (deleteError) {
      throw deleteError;
    }

    // Clear the storage path field on the contribution if this was a primary document
    const updateField = getStoragePathField(document.document_type);
    if (updateField) {
      await sb
        .from('tax_contributions')
        .update({ [updateField]: null })
        .eq('id', contribution_id)
        .eq(updateField, document.storage_path); // Only clear if it matches
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * Map document type to the corresponding storage path field on tax_contributions
 */
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
