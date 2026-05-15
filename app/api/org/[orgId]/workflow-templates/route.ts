import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const workflowType = searchParams.get('workflow_type');
    const activeOnly = searchParams.get('active') !== 'false';

    const adminClient = createAdminClient();
    let query = adminClient
      .from('workflow_templates')
      .select('*')
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (activeOnly) query = query.eq('is_active', true);
    if (workflowType) query = query.eq('workflow_type', workflowType);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ templates: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
