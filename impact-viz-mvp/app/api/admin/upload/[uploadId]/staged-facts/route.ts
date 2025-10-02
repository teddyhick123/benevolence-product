import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * Get staged facts for an upload
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId } = await params;

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
    }

    const sb = supabaseService();

    const { data: facts, error } = await sb
      .from('staging_metric_facts')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('approved', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching staged facts:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ facts: facts || [] });
  } catch (error: any) {
    console.error('Staged facts fetch error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch staged facts',
    }, { status: 500 });
  }
}
