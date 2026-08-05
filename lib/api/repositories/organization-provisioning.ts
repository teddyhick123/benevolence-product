import { createElevatedClient } from '@/lib/api/admin-client';
import type { UserAccessContext } from '@/lib/api/principals';
import type { OrgType } from '@/lib/types/org';

export type OrganizationProvisioningInput = {
  name: string;
  ein?: string | null;
  orgType: OrgType;
  fiscalYearEnd?: string | null;
  stateOfIncorporation?: string | null;
};

/** Elevated multi-record provisioning constrained to the authenticated creator. */
export function createOrganizationProvisioningRepository(scope: UserAccessContext) {
  const db = createElevatedClient();

  async function removeOrganization(orgId: string) {
    await db.from('organizations').delete().eq('id', orgId);
  }

  return {
    async create(input: OrganizationProvisioningInput) {
      const { data: provisionedOrgId, error: provisionError } = await db.rpc(
        'provision_organization',
        {
          p_name: input.name,
          p_org_type: input.orgType,
          p_owner_user_id: scope.principal.userId,
          p_ein: input.ein || null,
          p_modules: { portfolio: true },
        }
      );
      if (provisionError) throw provisionError;

      const orgId = provisionedOrgId as string;
      const { data: organization, error: organizationError } = await db
        .from('organizations')
        .update({
          org_type_config: {
            fiscal_year_end: input.fiscalYearEnd || null,
            state_of_incorporation: input.stateOfIncorporation || null,
          },
        })
        .eq('id', orgId)
        .select()
        .single();
      if (organizationError) {
        await removeOrganization(orgId);
        throw organizationError;
      }

      const { data: portfolio, error: portfolioError } = await db
        .from('portfolios')
        .insert({
          org_id: orgId,
          owner_id: scope.principal.userId,
          name: input.name,
          settings: { base_currency: 'USD' },
        })
        .select('id')
        .single();
      if (portfolioError || !portfolio) {
        await removeOrganization(orgId);
        throw portfolioError ?? new Error('Default portfolio could not be created');
      }

      const { error: portfolioMemberError } = await db.from('portfolio_members').insert({
        user_id: scope.principal.userId,
        portfolio_id: portfolio.id,
        role: 'owner',
      });
      if (portfolioMemberError) {
        await removeOrganization(orgId);
        throw portfolioMemberError;
      }

      const currentYear = new Date().getFullYear();
      await db.from('filing_calendar').insert([
        {
          org_id: orgId,
          filing_type: 'form_990_pf',
          title: 'Form 990-PF Annual Return',
          description: 'Annual return for private foundations — reports assets, income, distributions, and officer compensation.',
          jurisdiction: 'federal',
          due_date: `${currentYear}-05-15`,
          extension_due_date: `${currentYear}-11-15`,
          period_start: `${currentYear - 1}-01-01`,
          period_end: `${currentYear - 1}-12-31`,
          status: 'upcoming',
        },
        {
          org_id: orgId,
          filing_type: 'irs_extension',
          title: 'Form 8868 — Extension Request',
          description: 'Automatic 6-month extension of time to file Form 990-PF. Extends deadline from May 15 to November 15.',
          jurisdiction: 'federal',
          due_date: `${currentYear}-05-15`,
          period_start: `${currentYear - 1}-01-01`,
          period_end: `${currentYear - 1}-12-31`,
          status: 'upcoming',
        },
      ]);

      return { ...organization, portfolio_id: portfolio.id };
    },
  };
}
