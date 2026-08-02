import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  ModuleId,
  applyModulePreset,
  disableModule,
  enableModule,
  getModulePresets,
  getOrgEnabledModules,
} from '@/lib/modules';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** GET /api/org/[orgId]/modules */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const enabledModules = await getOrgEnabledModules(access.context.db, orgId);
    const { presets } = await getModulePresets(access.context.db);
    return jsonOk({ enabledModules, presets });
  } catch (error) {
    console.error('Error getting modules:', error);
    return jsonError('Failed to get modules', 500);
  }
}

/** POST /api/org/[orgId]/modules */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  try {
    const { action, moduleId, presetId } = await req.json();
    let result;

    if (action === 'enable' && moduleId) {
      result = await enableModule(
        access.context.db,
        orgId,
        moduleId as ModuleId,
        access.context.principal.userId
      );
      if (!result.success) return jsonError(result.error || 'Failed to enable module', 400);
      return jsonOk({ success: true, enabledModules: result.enabledModules });
    }

    if (action === 'disable' && moduleId) {
      result = await disableModule(access.context.db, orgId, moduleId as ModuleId);
      if (!result.success) return jsonError(result.error || 'Failed to disable module', 400);
      return jsonOk({ success: true });
    }

    if (action === 'apply_preset' && presetId) {
      result = await applyModulePreset(
        access.context.db,
        orgId,
        presetId,
        access.context.principal.userId
      );
      if (!result.success) return jsonError(result.error || 'Failed to apply preset', 400);
      return jsonOk({ success: true, enabledModules: result.enabledModules });
    }

    return jsonError('Invalid action. Use "enable", "disable", or "apply_preset"', 400);
  } catch (error) {
    console.error('Error managing modules:', error);
    return jsonError('Failed to manage modules', 500);
  }
}
