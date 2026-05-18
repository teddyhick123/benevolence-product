import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { documentTypeSchema } from '@/lib/schemas/tax';
import type { DocumentType } from '@/lib/schemas/tax';

const getSupabase = createSupabaseServerClient;

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
  const supabase = await getSupabase();

  // Explicitly check portfolio view access
  const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
    p_portfolio_id: portfolioId,
  });

  if (canViewErr || !canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch documents
  const { data, error } = await supabase
    .from('tax_documents')
    .select('*, created_at:uploaded_at')
    .eq('portfolio_id', portfolioId)
    .eq('tax_contribution_id', contributionId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
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
  const supabase = await getSupabase();

  // Check edit permission
  const { data: canEdit, error: permError } = await supabase.rpc(
    'can_edit_portfolio',
    { p_portfolio_id: portfolioId }
  );

  if (permError || !canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify contribution exists and belongs to portfolio
  const { data: contribution, error: contribError } = await supabase
    .from('tax_contributions')
    .select('id, tax_year')
    .eq('id', contributionId)
    .eq('portfolio_id', portfolioId)
    .single();

  if (contribError || !contribution) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate document type
    const typeResult = documentTypeSchema.safeParse(documentType);
    if (!typeResult.success) {
      return NextResponse.json(
        { error: 'Invalid document type' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Please upload PDF, JPEG, PNG, or WebP.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${contributionId}/${documentType}-${Date.now()}.${fileExt}`;
    // storagePath is the object path within the bucket — must NOT include the bucket name
    const storagePath = `${portfolioId}/${fileName}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('tax-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file: ' + uploadError.message },
        { status: 500 }
      );
    }

    // Generate a signed URL valid for 1 hour — documents are private
    const { data: signedData, error: signedError } = await supabase.storage
      .from('tax-documents')
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedData?.signedUrl) {
      // Clean up the uploaded file before returning the error
      await supabase.storage.from('tax-documents').remove([storagePath]);
      return NextResponse.json({ error: 'Failed to generate document URL' }, { status: 500 });
    }

    // Create document record
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
      // Try to clean up uploaded file
      await supabase.storage.from('tax-documents').remove([storagePath]);
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    // Update contribution storage path based on document type
    const updateField = getStoragePathField(documentType as DocumentType);
    if (updateField) {
      await supabase
        .from('tax_contributions')
        .update({ [updateField]: storagePath })
        .eq('id', contributionId);
    }

    return NextResponse.json({
      data: {
        ...docRecord,
        signed_url: signedData.signedUrl,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
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
