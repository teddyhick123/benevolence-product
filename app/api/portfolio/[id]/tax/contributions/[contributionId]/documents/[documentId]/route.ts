import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { createTaxRepository } from '@/lib/api/repositories/tax';
import { jsonError, jsonOk } from '@/lib/api/responses';

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]
 * Get a single document with signed URL for viewing
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string; documentId: string }> }
) {
  const { id: portfolio_id, contributionId: contribution_id, documentId: doc_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) {
    return access.reason === 'infrastructure'
      ? jsonError('Forbidden', 403)
      : access.response;
  }
  const sb = access.context.db;

  try {
    // Fetch document
    const { data: document, error } = await sb
      .from('tax_documents')
      .select('*')
      .eq('id', doc_id)
      .eq('tax_contribution_id', contribution_id)
      .eq('portfolio_id', portfolio_id)
      .single();

    if (error) {
      throw error;
    }

    if (!document) {
      return jsonError('Document not found', 404);
    }

    // Generate signed URL for private access (valid for 1 hour)
    const taxRepository = createTaxRepository(access.context);
    const { data: signedData, error: signedError } = await taxRepository
      .createSignedDocumentUrl({
        contributionId: contribution_id,
        storagePath: document.storage_path,
      });

    if (signedError || !signedData?.signedUrl) {
      return jsonError('Failed to generate document URL', 500);
    }

    return jsonOk({
      data: {
        ...document,
        signed_url: signedData.signedUrl,
      },
    }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (error) {
    console.error('Error fetching document:', error);
    return jsonError('Failed to fetch document', 500);
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
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Not authorized', 403);
  }
  const sb = access.context.db;

  try {
    // Fetch document to get storage path (user-session client)
    const { data: document, error: fetchError } = await sb
      .from('tax_documents')
      .select('*')
      .eq('id', doc_id)
      .eq('tax_contribution_id', contribution_id)
      .eq('portfolio_id', portfolio_id)
      .single();

    if (fetchError || !document) {
      return jsonError('Document not found', 404);
    }

    const taxRepository = createTaxRepository(access.context);
    const { error: storageError } = await taxRepository.removeDocumentObject({
      contributionId: contribution_id,
      storagePath: document.storage_path,
    });

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continue anyway to delete database record
    }

    // Delete database record (user-session client)
    const { error: deleteError } = await sb
      .from('tax_documents')
      .delete()
      .eq('id', doc_id)
      .eq('tax_contribution_id', contribution_id)
      .eq('portfolio_id', portfolio_id);

    if (deleteError) {
      throw deleteError;
    }

    // Clear the storage path field on the contribution if this was a primary document (user-session client)
    const updateField = getStoragePathField(document.document_type);
    if (updateField) {
      await sb
        .from('tax_contributions')
        .update({ [updateField]: null })
        .eq('id', contribution_id)
        .eq('portfolio_id', portfolio_id)
        .eq(updateField, document.storage_path); // Only clear if it matches
    }

    return jsonOk({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    return jsonError('Failed to delete document', 500);
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
