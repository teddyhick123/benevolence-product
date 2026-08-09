import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { getOrgEnabledModules } from '@/lib/modules';

type OrganizationDashboardScope = Pick<OrgAccessContext, 'orgId'>;

/** Organization overview reads constrained to one already-authorized organization. */
export function createOrganizationDashboardRepository(scope: OrganizationDashboardScope) {
  const db = createElevatedClient();

  return {
    async load() {
      const { data: org, error } = await db
        .from('organizations')
        .select('id, name, branding, org_type_config, ein, org_type, website, created_at')
        .eq('id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      if (!org) return null;

      const enabledModules = await getOrgEnabledModules(db, scope.orgId);
      return { org, enabledModules };
    },
  };
}
