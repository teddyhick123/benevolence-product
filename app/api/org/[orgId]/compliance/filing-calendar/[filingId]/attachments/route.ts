import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; filingId: string }>;
}

interface Attachment {
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
}

async function getAuthAndAdmin(orgId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  return { user, isAdmin: !!isAdmin };
}

// GET /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
// Returns all attachments for a filing with fresh signed URLs (3600s expiry)
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const { user, isAdmin } = await getAuthAndAdmin(orgId);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const db = createAdminClient();
    const { data: filing, error } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (error || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const attachments: Attachment[] = filing.attachments ?? [];
    if (attachments.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const withUrls = await Promise.all(
      attachments.map(async (att) => {
        const { data } = await db.storage
          .from('compliance-documents')
          .createSignedUrl(att.path, 3600);
        return { ...att, signed_url: data?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ data: withUrls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
// Uploads a file (multipart/form-data, field: "file") and appends metadata to filing.attachments
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const { user, isAdmin } = await getAuthAndAdmin(orgId);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 20 MB limit' }, { status: 413 });
    }

    const db = createAdminClient();

    const { data: filing, error: fetchError } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${orgId}/${filingId}/${Date.now()}_${safeFileName}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await db.storage
      .from('compliance-documents')
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const attachment: Attachment = {
      path,
      name: file.name,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };

    const currentAttachments: Attachment[] = filing.attachments ?? [];
    const { error: updateError } = await db
      .from('filing_calendar')
      .update({ attachments: [...currentAttachments, attachment] })
      .eq('id', filingId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: signed } = await db.storage
      .from('compliance-documents')
      .createSignedUrl(path, 3600);

    return NextResponse.json(
      { data: { ...attachment, signed_url: signed?.signedUrl ?? null } },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments
// Body: { path: string } — removes the file from storage and the metadata from filing.attachments
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const { user, isAdmin } = await getAuthAndAdmin(orgId);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { path } = body;
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const db = createAdminClient();

    const { data: filing, error: fetchError } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const currentAttachments: Attachment[] = filing.attachments ?? [];
    const filtered = currentAttachments.filter(a => a.path !== path);

    if (filtered.length === currentAttachments.length) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    await db.storage.from('compliance-documents').remove([path]);

    const { error: updateError } = await db
      .from('filing_calendar')
      .update({ attachments: filtered })
      .eq('id', filingId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
