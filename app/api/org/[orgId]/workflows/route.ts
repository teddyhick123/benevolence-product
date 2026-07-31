import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  WorkflowStartInputError,
  createWorkflowRepository,
} from '@/lib/api/repositories/workflows';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { startWorkflowSchema } from '@/lib/schemas/workflow';

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
    const portfolioId = searchParams.get('portfolio_id');
    const status = searchParams.get('status');
    const grantId = searchParams.get('grant_id');
    const db = access.context.db;

    if (portfolioId) {
      const { data: portfolio } = await db
        .from('portfolios')
        .select('id')
        .eq('id', portfolioId)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!portfolio) {
        return jsonError('Portfolio does not belong to this organization', 400);
      }
    }

    let query = db
      .from('workflow_instances')
      .select(`
        *,
        workflow_templates(name, workflow_type),
        grants(holding_id, holdings(name)),
        workflow_tasks(*)
      `)
      .eq('org_id', orgId)
      .order('started_at', { ascending: false });

    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (grantId) query = query.eq('grant_id', grantId);

    const { data, error } = await query;
    if (error) return jsonError(error.message, 500);
    return jsonOk({ workflows: data || [] });
  } catch (error: any) {
    return jsonError(error.message, 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const parsed = startWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Validation failed', 400, {
        details: parsed.error.format(),
      });
    }

    const repository = createWorkflowRepository({
      orgId,
      actorId: access.context.principal.userId,
    });
    const workflow = await repository.startWorkflow(parsed.data);
    return jsonOk({ workflow }, { status: 201 });
  } catch (error: any) {
    if (error instanceof WorkflowStartInputError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(error.message, 500);
  }
}
