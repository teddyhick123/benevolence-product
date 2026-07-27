import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { createTaxRepository } from '@/lib/api/repositories/tax';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { documentTypeSchema } from '@/lib/schemas/tax';
import type { DocumentType } from '@/lib/schemas/tax';

// Allowed MIME types for tax documents
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]/documents
 * List all documents for a contribution
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolioId, contributionId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId);
  if (isAccessDenied(access)) {
    return access.reason === 'infrastructure'
      ? jsonError('Forbidden', 403)
      : access.response;
  }
  const supabase = access.context.db;

  // Fetch documents
  const { data, error } = await supabase
    .from('tax_documents')
    .select('*, created_at:uploaded_at')
    .eq('portfolio_id', portfolioId)
    .eq('tax_contribution_id', contributionId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ data });
}

/**
 * POST /api/portfolio/[id]/tax/contributions/[contributionId]/documents
 * Upload a document for a contribution
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolioId, contributionId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Forbidden', 403);
  }
  const supabase = access.context.db;

  // Verify contribution exists and belongs to portfolio (user-session client)
  const { data: contribution, error: contribError } = await supabase
    .from('tax_contributions')
    .select('id, tax_year')
    .eq('id', contributionId)
    .eq('portfolio_id', portfolioId)
    .single();

  if (contribError || !contribution) {
    return jsonError('Contribution not found', 404);
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string;

    if (!file) {
      return jsonError('No file provided', 400);
    }

    // Validate document type
    const typeResult = documentTypeSchema.safeParse(documentType);
    if (!typeResult.success) {
      return jsonError('Invalid document type', 400);
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return jsonError(
        'File type not allowed. Please upload PDF, JPEG, PNG, or WebP.',
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return jsonError('File size must be less than 10MB', 400);
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const objectName = `${documentType}-${Date.now()}.${fileExt}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const taxRepository = createTaxRepository(access.context);
    const { error: uploadError, storagePath } = await taxRepository
      .uploadDocumentObject({
        contributionId,
        objectName,
        body: buffer,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return jsonError('Failed to upload file: ' + uploadError.message, 500);
    }

    // Generate a signed URL valid for 1 hour — documents are private.
    const { data: signedData, error: signedError } = await taxRepository
      .createSignedDocumentUrl({ contributionId, storagePath });

    if (signedError || !signedData?.signedUrl) {
      const { error: cleanupError } = await taxRepository
        .removeDocumentObject({ contributionId, storagePath });
      if (cleanupError) {
        return jsonError(cleanupError.message, 500);
      }
      return jsonError('Failed to generate document URL', 500);
    }

    // Create document record (user-session client — RLS applies)
    const { data: docRecord, error: docError } = await supabase
      .from('tax_documents')
      .insert({
        portfolio_id: portfolioId,
        tax_contribution_id: contributionId,
        tax_year: contribution.tax_year,
        document_type: documentType as DocumentType,
        storage_path: storagePath,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        generated_by_system: false,
      })
      .select()
      .single();

    if (docError) {
      const { error: cleanupError } = await taxRepository
        .removeDocumentObject({ contributionId, storagePath });
      if (cleanupError) {
        return jsonError(cleanupError.message, 500);
      }
      return jsonError(docError.message, 500);
    }

    // Update contribution storage path based on document type (user-session client)
    const updateField = getStoragePathField(documentType as DocumentType);
    if (updateField) {
      const { error: pointerError } = await supabase
        .from('tax_contributions')
        .update({ [updateField]: storagePath })
        .eq('id', contributionId)
        .eq('portfolio_id', portfolioId);

      if (pointerError) {
        const { error: docDeleteError } = await supabase
          .from('tax_documents')
          .delete()
          .eq('id', docRecord.id)
          .eq('portfolio_id', portfolioId)
          .eq('tax_contribution_id', contributionId);
        const { error: storageDeleteError } = await taxRepository
          .removeDocumentObject({ contributionId, storagePath });
        return jsonError(pointerError.message, 500, {
          rollback_error: docDeleteError?.message ?? storageDeleteError?.message ?? null,
        });
      }
    }

    return jsonOk({
      data: {
        ...docRecord,
        signed_url: signedData.signedUrl,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return jsonError('Failed to upload document', 500);
  }
}

/**
 * Map document type to the corresponding storage path field on tax_contributions
 */
function getStoragePathField(docType: DocumentType): string | null {
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
