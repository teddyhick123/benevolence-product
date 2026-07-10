import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

type Params = { id: string; grantId: string };

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

async function requireGrantInPortfolio(
  sb: ReturnType<typeof createAdminClient>,
  grantId: string,
  portfolioId: string
) {
  const { data, error } = await sb
    .from('grants')
    .select('id')
    .eq('id', grantId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * GET /api/portfolio/[id]/grants/[grantId]/documents
 * List all documents for a grant
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify portfolio membership
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    const sb = createAdminClient();
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return json({ error: 'Grant not found' }, { status: 404 });
    }

    const { data, error } = await sb
      .from('grant_documents')
      .select('*')
      .eq('grant_id', grantId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Generate signed URLs for each document
    const docs = await Promise.all(
      (data || []).map(async (doc) => {
        const { data: urlData, error: signedUrlError } = await sb.storage
          .from('grant-documents')
          .createSignedUrl(doc.storage_path, 3600); // 1 hour
        if (signedUrlError) throw signedUrlError;
        return { ...doc, signed_url: urlData?.signedUrl || null };
      })
    );

    return json({ data: docs });
  } catch (err: any) {
    console.error('Error fetching grant documents:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/grants/[grantId]/documents
 * Upload a document for a grant (multipart/form-data)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require member role or above
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin', 'member'].includes(membership.role)) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('document_type') as string) || 'proposal';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return json(
        { error: 'File type not allowed. Accepted: PDF, DOCX, XLSX, JPEG, PNG, WebP.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return json(
        { error: 'File size must be less than 10MB.' },
        { status: 400 }
      );
    }

    // Build storage path
    const ext = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const storagePath = `${portfolioId}/${grantId}/${documentType}-${timestamp}.${ext}`;

    const sb = createAdminClient();
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return json({ error: 'Grant not found' }, { status: 404 });
    }

    // Upload to Supabase storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await sb.storage
      .from('grant-documents')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Insert DB record
    const { data: doc, error: dbError } = await sb
      .from('grant_documents')
      .insert({
        grant_id: grantId,
        document_type: documentType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      // Rollback storage upload
      const { error: removeError } = await sb.storage.from('grant-documents').remove([storagePath]);
      if (removeError) throw removeError;
      throw dbError;
    }

    return json({ data: doc }, { status: 201 });
  } catch (err: any) {
    console.error('Error uploading grant document:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/grants/[grantId]/documents?documentId=
 * Delete a document
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return json({ error: 'documentId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require member role or above
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin', 'member'].includes(membership.role)) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const sb = createAdminClient();
    const grantInPortfolio = await requireGrantInPortfolio(sb, grantId, portfolioId);
    if (!grantInPortfolio) {
      return json({ error: 'Grant not found' }, { status: 404 });
    }

    // Delete the DB row first so a storage failure cannot leave document lists
    // pointing at a missing object.
    const { data: deletedDoc, error: deleteError } = await sb
      .from('grant_documents')
      .delete()
      .eq('id', documentId)
      .eq('grant_id', grantId)
      .select('storage_path')
      .single();

    if (deleteError || !deletedDoc) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    const { error: storageDeleteError } = await sb.storage
      .from('grant-documents')
      .remove([deletedDoc.storage_path]);
    if (storageDeleteError) {
      console.error('Grant document storage cleanup failed:', storageDeleteError);
      return json(
        {
          success: true,
          storage_cleanup_pending: true,
          warning: 'Document record deleted, but storage cleanup failed.',
        },
        { status: 202 }
      );
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('Error deleting grant document:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
