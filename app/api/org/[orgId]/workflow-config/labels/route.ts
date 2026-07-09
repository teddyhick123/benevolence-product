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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Any org member can read labels, but service-role reads still need an
    // explicit org boundary check before bypassing RLS.
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('org_workflow_config')
      .select('stage_key, config_value')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'stage_label')
      .order('stage_key');

    if (error) throw error;

    const labels: Record<string, string> = {};
    for (const row of data ?? []) {
      const value = (row.config_value as any)?.value;
      if (value) labels[row.stage_key] = value;
    }

    return NextResponse.json({ labels }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
