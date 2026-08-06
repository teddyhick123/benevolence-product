import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext } from '@/lib/api/principals';
import { createOrganizationProvisioningRepository } from '@/lib/api/repositories/organization-provisioning';

/** Small, typed demo fixture. Deliberately cannot execute arbitrary SQL. */
export function createDemoSeedingRepository(scope: AppAdminAccessContext) {
  const db = createElevatedClient();

  return {
    async seed() {
      const { data: membership, error: membershipError } = await db
        .from('organization_members')
        .select('org_id')
        .eq('user_id', scope.user.id)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;

      let orgId = membership?.org_id;
      let portfolioId: string | undefined;

      if (!orgId) {
        const created = await createOrganizationProvisioningRepository(scope).create({
          name: 'Demo Foundation',
          orgType: 'private_foundation',
        });
        orgId = created.id;
        portfolioId = created.portfolio_id;
      } else {
        const { data: portfolio, error } = await db
          .from('portfolios')
          .select('id')
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .order('created_at')
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        portfolioId = portfolio?.id;
      }

      if (!portfolioId) {
        const { data: portfolio, error } = await db
          .from('portfolios')
          .insert({ org_id: orgId, owner_id: scope.user.id, name: 'Demo Portfolio' })
          .select('id')
          .single();
        if (error) throw error;
        portfolioId = portfolio.id;
        const { error: memberError } = await db.from('portfolio_members').insert({
          portfolio_id: portfolioId,
          user_id: scope.user.id,
          role: 'owner',
        });
        if (memberError) throw memberError;
      }

      const { data: existing, error: existingError } = await db
        .from('holdings')
        .select('id')
        .eq('portfolio_id', portfolioId)
        .eq('source_system', 'typed_demo_seed');
      if (existingError) throw existingError;

      if ((existing ?? []).length === 0) {
        const { error } = await db.from('holdings').insert([
          {
            org_id: orgId,
            portfolio_id: portfolioId,
            name: 'Community Health Initiative',
            asset_type: 'foundation_grant',
            sector: 'Health',
            funds_allocated: 250000,
            current_value: 250000,
            source_system: 'typed_demo_seed',
          },
          {
            org_id: orgId,
            portfolio_id: portfolioId,
            name: 'Regional Education Fund',
            asset_type: 'donation',
            sector: 'Education',
            funds_allocated: 125000,
            current_value: 125000,
            source_system: 'typed_demo_seed',
          },
          {
            org_id: orgId,
            portfolio_id: portfolioId,
            name: 'Climate Resilience Partnership',
            asset_type: 'program_related_investment',
            sector: 'Climate',
            funds_allocated: 400000,
            current_value: 420000,
            source_system: 'typed_demo_seed',
          },
        ]);
        if (error) throw error;
      }

      return { portfolioId, recordsCreated: (existing ?? []).length === 0 ? 3 : 0 };
    },
  };
}
