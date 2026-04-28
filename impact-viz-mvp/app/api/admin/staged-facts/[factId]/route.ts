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
 * Delete a staged fact (reject it)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ factId: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { factId } = await params;

    if (!factId) {
      return NextResponse.json({ error: 'factId required' }, { status: 400 });
    }

    const sb = supabaseService();

    const { error } = await sb
      .from('staging_metric_facts')
      .delete()
      .eq('id', factId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Failed to delete fact',
    }, { status: 500 });
  }
}
