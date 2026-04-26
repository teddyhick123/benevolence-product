// app/api/admin/builder/proposals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'applied'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, org_id, request_text, proposal_type, status, generated_code, config_patch, reviewer_notes, created_at, reviewed_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
