import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;

    const { searchParams } = new URL(req.url);
    const workflowType = searchParams.get('workflow_type');
    const activeOnly = searchParams.get('active') !== 'false';

    let query = access.context.db
      .from('workflow_templates')
      .select('*')
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (activeOnly) query = query.eq('is_active', true);
    if (workflowType) query = query.eq('workflow_type', workflowType);

    const { data, error } = await query;
    if (error) return jsonError(error.message, 500);

    return jsonOk({ templates: data || [] });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
