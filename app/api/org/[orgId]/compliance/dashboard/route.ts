import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

/**
 * GET /api/org/[orgId]/compliance/dashboard
 * Compliance health summary: dashboard stats + upcoming deadlines + open incidents
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;
    const db = access.context.db;

    // Check module enabled
    const { data: hasModule, error: moduleError } = await db.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'compliance',
    });
    if (moduleError) return jsonError(moduleError.message, 500);
    if (!hasModule) return jsonError('Module not enabled', 403);

    // Fetch in parallel
    const [dashboardRes, deadlinesRes, incidentsRes, profileRes] = await Promise.all([
      db.from('v_compliance_dashboard').select('*').eq('org_id', orgId).maybeSingle(),
      db.from('v_upcoming_filing_deadlines').select('*').eq('org_id', orgId).limit(5),
      db.from('self_dealing_incidents')
        .select('*')
        .eq('org_id', orgId)
        .in('status', ['flagged', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(5),
      db.from('compliance_profiles').select('*').eq('org_id', orgId).maybeSingle(),
    ]);
    for (const result of [dashboardRes, deadlinesRes, incidentsRes, profileRes]) {
      if (result.error) throw result.error;
    }

    return jsonOk({
      dashboard: dashboardRes.data || null,
      upcoming_deadlines: deadlinesRes.data || [],
      open_incidents: incidentsRes.data || [],
      profile: profileRes.data || null,
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
