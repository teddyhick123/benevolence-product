import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const { data, error } = await access.context.db
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

    return jsonOk({ labels });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
