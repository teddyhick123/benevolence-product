import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const db = createAdminClient();
    const { data: hasModule, error: moduleErr } = await db.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'grant_management',
    });
    if (moduleErr) throw moduleErr;
    if (!hasModule) {
      return json({ error: 'Grant management module is not enabled' }, { status: 403 });
    }

    const { data, error } = await db
      .from('org_workflow_config')
      .select('id, config_type, stage_key, config_key, config_value, sort_order, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .order('stage_key')
      .order('sort_order');

    if (error) throw error;

    return json({ data: data ?? [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
