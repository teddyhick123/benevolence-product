// app/api/org/[orgId]/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('org_audit_log')
      .select(`
        id, action, target_id, metadata, created_at,
        profiles!actor_id ( email, full_name )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = (data || []).map((row: any) => ({
      id: row.id,
      action: row.action,
      target_id: row.target_id,
      metadata: row.metadata,
      created_at: row.created_at,
      actor_email: row.profiles?.email || null,
      actor_name: row.profiles?.full_name || null,
    }));

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
