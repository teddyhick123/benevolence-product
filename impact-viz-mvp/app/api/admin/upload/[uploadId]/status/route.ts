import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * Get the status of an upload
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uploadId } = await params;

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
    }

    const sb = supabaseService();

    // Fetch upload with related staging facts count
    const { data: upload, error: uploadErr } = await sb
      .from('uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (uploadErr || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    // Count staging facts for this upload
    const { count: factsCount } = await sb
      .from('staging_metric_facts')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', uploadId);

    return NextResponse.json({
      uploadId: upload.id,
      status: upload.status,
      fileName: upload.file_name,
      createdAt: upload.created_at,
      updatedAt: upload.updated_at,
      portfolioId: upload.portfolio_id,
      holdingId: upload.holding_id,
      aiMode: upload.ai_mode,
      factsExtracted: factsCount || 0,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Failed to check status',
    }, { status: 500 });
  }
}
