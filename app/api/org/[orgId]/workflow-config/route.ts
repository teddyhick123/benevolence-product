import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const stageLabelSchema = z.object({
  action: z.literal('set_stage_label'),
  stage_key: z.enum(LIFECYCLE_STAGES),
  label: z.string().trim().max(60),
}).strict();

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const db = access.context.db;
    const { data: hasModule, error: moduleErr } = await db.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'grant_management',
    });
    if (moduleErr) throw moduleErr;
    if (!hasModule) {
      return jsonError('Grant management module is not enabled', 403);
    }

    const { data, error } = await db
      .from('org_workflow_config')
      .select('id, config_type, stage_key, config_key, config_value, sort_order, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .order('stage_key')
      .order('sort_order');

    if (error) throw error;

    return jsonOk({ data: data ?? [] });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const parsed = stageLabelSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Validation failed', 400, {
        details: parsed.error.format(),
      });
    }

    const db = access.context.db;
    const { data: hasModule, error: moduleErr } = await db.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'grant_management',
    });
    if (moduleErr) throw moduleErr;
    if (!hasModule) return jsonError('Grant management module is not enabled', 403);

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
      return jsonOk({ data: { stage_key, label: null } });
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
    return jsonOk({ data });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Internal error', 500);
  }
}
