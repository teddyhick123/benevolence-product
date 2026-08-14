import { createElevatedClient } from '@/lib/api/admin-client';
import { enableModule, getRequiredModules, toDbModuleSlug } from '@/lib/modules';
import type { ModuleId } from '@/lib/modules/types';
import {
  automationRowsFromOnboardingProfile,
  contextRowsFromOnboardingProfile,
  customFieldRowsFromOnboardingProfile,
  viewRowsFromOnboardingProfile,
  workflowRowsFromOnboardingProfile,
} from '@/lib/onboarding/provision-config';
import type { OrgType } from '@/lib/types/org';

export type OnboardingProvisioningInput = {
  name: string;
  orgType: OrgType;
  ein?: string;
  requestedModules: Record<string, boolean> | null;
  selectedModuleIds: ModuleId[];
  sessionId?: string;
  failAfterPortfolio?: boolean;
};

export type OnboardingProvisioningResult = {
  orgId: string;
  portfolioId: string;
  enabledModules: string[];
  moduleErrors: string[];
  setupErrors: string[];
};

export class OnboardingProvisioningError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OnboardingProvisioningError';
    this.status = status;
  }
}

function fail(message: string, status: number): never {
  throw new OnboardingProvisioningError(message, status);
}

function requestedDbModules(input: OnboardingProvisioningInput): Record<string, boolean> {
  const modules: Record<string, boolean> = { ...(input.requestedModules ?? {}), portfolio: true };
  for (const moduleId of input.selectedModuleIds) {
    for (const requiredModuleId of [moduleId, ...getRequiredModules(moduleId)]) {
      modules[toDbModuleSlug(requiredModuleId)] = true;
    }
  }
  return modules;
}

function withoutOrgId<T extends { org_id: string }>(rows: T[]) {
  return rows.map(({ org_id: _orgId, ...row }) => row);
}

function failProvisioningRpc(error: { message: string; code?: string | null }): never {
  if (error.code === 'P0002') fail(error.message, 404);
  if (error.code === 'P0001' || error.code === '23505') fail(error.message, 409);
  if (error.code === '22023') fail(error.message, 400);
  fail(error.message, 500);
}

export function createOnboardingProvisioner(userId: string) {
  const db = createElevatedClient();

  return {
    async provision(input: OnboardingProvisioningInput): Promise<OnboardingProvisioningResult> {
      if (input.sessionId) {
        const { data: sessionData, error } = await db
          .from('onboarding_sessions')
          .select('id, user_id, org_id, started_at')
          .eq('id', input.sessionId)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) fail(error.message, 500);
        if (!sessionData) fail('Onboarding session not found', 404);
        const { data: profile, error: profileError } = await db
          .from('onboarding_profiles')
          .select('workflows')
          .eq('session_id', sessionData.id)
          .maybeSingle();
        if (profileError) fail(profileError.message, 500);

        // The builders include org_id because they are also used for ordinary
        // org-scoped writes. The RPC is the authority for the real org id and
        // deliberately ignores this placeholder when it inserts configuration.
        const configSeedOrgId = sessionData.id;
        const contextRows = contextRowsFromOnboardingProfile(profile, configSeedOrgId, userId);
        const viewRows = viewRowsFromOnboardingProfile(profile, configSeedOrgId);
        const workflowRows = workflowRowsFromOnboardingProfile(profile, configSeedOrgId);
        const customFieldRows = customFieldRowsFromOnboardingProfile(profile, configSeedOrgId);
        const automationRows = automationRowsFromOnboardingProfile(
          profile,
          configSeedOrgId,
          userId,
          sessionData.id
        );

        const { data, error: provisioningError } = await db.rpc('provision_onboarding_session', {
          p_session_id: sessionData.id,
          p_owner_user_id: userId,
          p_name: input.name,
          p_org_type: input.orgType,
          p_ein: input.ein?.trim() || null,
          p_modules: requestedDbModules(input),
          p_context_rows: withoutOrgId(contextRows),
          p_view_rows: withoutOrgId(viewRows),
          p_workflow_rows: withoutOrgId(workflowRows),
          p_custom_field_rows: withoutOrgId(customFieldRows),
          p_automation_rows: withoutOrgId(automationRows),
        });
        if (provisioningError) failProvisioningRpc(provisioningError);

        const result = data as {
          org_id?: string;
          portfolio_id?: string;
          enabled_modules?: string[];
        } | null;
        if (!result?.org_id || !result.portfolio_id) {
          fail('Onboarding provisioning did not return an organization and portfolio', 500);
        }

        return {
          orgId: result.org_id,
          portfolioId: result.portfolio_id,
          enabledModules: result.enabled_modules ?? [],
          moduleErrors: [],
          setupErrors: [],
        };
      }

      const { data: memberships } = await db
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', userId);
      const existingOrgId = memberships?.[0]?.org_id as string | undefined;
      if (existingOrgId) {
        fail('User already belongs to an organization', 409);
      }

      const { data: provisionedOrgId, error: organizationError } = await db.rpc('provision_organization', {
        p_name: input.name,
        p_org_type: input.orgType,
        p_owner_user_id: userId,
        p_ein: input.ein?.trim() || null,
        p_modules: requestedDbModules(input),
      });
      if (organizationError) fail(organizationError.message, 500);
      const orgId = provisionedOrgId as string;

      const { data: portfolio, error: portfolioError } = await db
        .from('portfolios')
        .insert({
          org_id: orgId,
          owner_id: userId,
          name: input.name,
          settings: { base_currency: 'USD' },
        })
        .select('id')
        .single();
      if (portfolioError || !portfolio) {
        await db.from('organizations').delete().eq('id', orgId);
        fail(portfolioError?.message ?? 'Foundation portfolio could not be found or created', 500);
      }

      if (input.failAfterPortfolio) {
        await db.from('organizations').delete().eq('id', orgId);
        fail('Walkthrough fault: failed after portfolio creation', 500);
      }

      const { error: membershipError } = await db.from('portfolio_members').insert({
        portfolio_id: portfolio.id,
        user_id: userId,
        role: 'owner',
      });
      if (membershipError) {
        await db.from('organizations').delete().eq('id', orgId);
        fail(membershipError.message, 500);
      }

      const enabledModules: string[] = [];
      const moduleErrors: string[] = [];
      for (const moduleId of input.selectedModuleIds) {
        const result = await enableModule(db, orgId, moduleId, userId);
        if (result.success) enabledModules.push(...(result.enabledModules || [moduleId]));
        else moduleErrors.push(`${moduleId}: ${result.error || 'Unable to enable module'}`);
      }

      const setupErrors: string[] = [];

      return {
        orgId,
        portfolioId: portfolio.id,
        enabledModules: Array.from(new Set(enabledModules)),
        moduleErrors,
        setupErrors,
      };
    },
  };
}

export type OnboardingProvisioner = ReturnType<typeof createOnboardingProvisioner>;
