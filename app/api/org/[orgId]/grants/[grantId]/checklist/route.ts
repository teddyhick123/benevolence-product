import { NextRequest } from 'next/server';
import { z } from 'zod';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { SessionClient } from '@/lib/api/server-client';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

const checklistToggleSchema = z.object({
  stage_key: z.enum([...LIFECYCLE_STAGES] as [string, ...string[]]),
  item_key: z.string().regex(/^[a-z0-9_]+$/).max(64),
  completed: z.boolean(),
}).strict();

async function ensureGrantModuleAndScope(db: SessionClient, orgId: string, grantId: string) {
  const [{ data: hasModule, error: moduleErr }, { data: grant, error: grantErr }] = await Promise.all([
    db.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' }),
    db
      .from('grants')
      .select('id')
      .eq('id', grantId)
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  if (moduleErr) throw moduleErr;
  if (!hasModule) return jsonError('Grant management module is not enabled', 403);
  if (grantErr) throw grantErr;
  if (!grant) return jsonError('Grant not found', 404);
  return null;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const db = access.context.db;
    const scopeError = await ensureGrantModuleAndScope(db, orgId, grantId);
    if (scopeError) return scopeError;

    const [{ data: configRows, error: configErr }, { data: completionRows, error: completionErr }] =
      await Promise.all([
        db
          .from('org_workflow_config')
          .select('id, config_type, stage_key, config_key, config_value, sort_order')
          .eq('org_id', orgId)
          .eq('module', 'grant_management')
          .in('config_type', ['stage_checklist', 'approval_requirement'])
          .order('stage_key')
          .order('sort_order'),
        db
          .from('grant_checklist_completions')
          .select('workflow_config_id, checklist_item_key, completed_by, completed_at')
          .eq('org_id', orgId)
          .eq('grant_id', grantId),
      ]);

    if (configErr) throw configErr;
    if (completionErr) throw completionErr;

    const completionsByConfig = new Map(
      (completionRows ?? []).map((row: any) => [row.workflow_config_id, row])
    );
    const grouped: Record<string, {
      items: Array<{
        key: string;
        label: string;
        required: boolean;
        sort_order: number;
        completed: boolean;
        completed_by: string | null;
        completed_at: string | null;
      }>;
      approval_requirement: { required: boolean; description: string } | null;
    }> = {};

    for (const row of configRows ?? []) {
      const stageKey = row.stage_key as string;
      grouped[stageKey] ??= { items: [], approval_requirement: null };
      const value = (row.config_value ?? {}) as Record<string, unknown>;

      if (row.config_type === 'stage_checklist') {
        const completion = completionsByConfig.get(row.id) as any | undefined;
        grouped[stageKey].items.push({
          key: row.config_key,
          label: typeof value.label === 'string' ? value.label : row.config_key,
          required: value.required === true,
          sort_order: row.sort_order ?? 0,
          completed: Boolean(completion),
          completed_by: completion?.completed_by ?? null,
          completed_at: completion?.completed_at ?? null,
        });
      }

      if (row.config_type === 'approval_requirement') {
        grouped[stageKey].approval_requirement = {
          required: value.required === true,
          description: typeof value.description === 'string' ? value.description : '',
        };
      }
    }

    for (const stage of Object.values(grouped)) {
      stage.items.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    }

    return jsonOk({ data: grouped });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const parsed = checklistToggleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Validation failed', 400, { details: parsed.error.format() });
    }

    const { db, user } = access.context;
    const scopeError = await ensureGrantModuleAndScope(db, orgId, grantId);
    if (scopeError) return scopeError;

    const { stage_key: stageKey, item_key: itemKey, completed } = parsed.data;
    const { data: config, error: configErr } = await db
      .from('org_workflow_config')
      .select('id, config_key')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'stage_checklist')
      .eq('stage_key', stageKey)
      .eq('config_key', itemKey)
      .maybeSingle();

    if (configErr) throw configErr;
    if (!config) return jsonError('Checklist item not found', 404);

    if (completed) {
      const { error: insertErr } = await db
        .from('grant_checklist_completions')
        .upsert({
          org_id: orgId,
          grant_id: grantId,
          workflow_config_id: config.id,
          stage_key: stageKey,
          checklist_item_key: itemKey,
          completed_by: user.id,
        }, { onConflict: 'grant_id,workflow_config_id', ignoreDuplicates: true });

      if (insertErr) throw insertErr;
      return jsonOk({ success: true });
    }

    const { data: deleteData, error: deleteErr } = await db
      .from('grant_checklist_completions')
      .delete()
      .eq('org_id', orgId)
      .eq('grant_id', grantId)
      .eq('workflow_config_id', config.id)
      .select('id');

    if (deleteErr) throw deleteErr;
    if (!deleteData || deleteData.length === 0) {
      return jsonError('Item is not completed or you do not have permission to uncheck it', 404);
    }

    return jsonOk({ success: true });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
