import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { isWorkspaceManager } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const stageLabelSchema = z.object({
  action: z.literal('set_stage_label'),
  stage_key: z.enum(LIFECYCLE_STAGES),
  label: z.string().trim().max(60),
}).strict();

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
    if (!isWorkspaceManager(role)) {
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

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!isWorkspaceManager(role)) return json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const parsed = stageLabelSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const db = createAdminClient();
    const { data: hasModule, error: moduleErr } = await db.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'grant_management',
    });
    if (moduleErr) throw moduleErr;
    if (!hasModule) return json({ error: 'Grant management module is not enabled' }, { status: 403 });

    const { stage_key, label } = parsed.data;
    if (!label) {
      const { error } = await db
        .from('org_workflow_config')
        .delete()
        .eq('org_id', orgId)
        .eq('module', 'grant_management')
        .eq('config_type', 'stage_label')
        .eq('stage_key', stage_key)
        .eq('config_key', 'label');
      if (error) throw error;
      return json({ data: { stage_key, label: null } });
    }

    const { data, error } = await db
      .from('org_workflow_config')
      .upsert({
        org_id: orgId,
        module: 'grant_management',
        config_type: 'stage_label',
        stage_key,
        config_key: 'label',
        config_value: { value: label },
        sort_order: 0,
      }, { onConflict: 'org_id,module,config_type,stage_key,config_key' })
      .select('id, config_type, stage_key, config_key, config_value, sort_order, created_at, updated_at')
      .single();
    if (error) throw error;
    return json({ data });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
