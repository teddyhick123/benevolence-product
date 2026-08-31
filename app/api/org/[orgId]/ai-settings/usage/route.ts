import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createAISpendCapRepository } from '@/lib/api/repositories/ai-spend-caps';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const caps = createAISpendCapRepository({ orgId });
  const periodStart = caps.periodStart();
  try {
    const [cap, report] = await Promise.all([
      caps.getStatus(),
      createElevatedClient().rpc('org_ai_usage_report', {
        p_org_id: orgId,
        p_period_start: periodStart.toISOString(),
      }),
    ]);
    if (report.error) throw report.error;
    return jsonOk({ cap, report: report.data });
  } catch {
    return jsonError('Usage report could not be loaded', 502);
  }
}
