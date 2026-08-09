import { createElevatedClient } from '@/lib/api/admin-client';
import { enableModule } from '@/lib/modules';
import type { ModuleId } from '@/lib/modules/types';
import {
  automationRowsFromOnboardingProfile,
  contextRowsFromOnboardingProfile,
  customFieldRowsFromOnboardingProfile,
  viewRowsFromOnboardingProfile,
  workflowRowsFromOnboardingProfile,
} from '@/lib/onboarding-provision-config';
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

export function createOnboardingProvisioner(userId: string) {
  const db = createElevatedClient();

  return {
    async provision(input: OnboardingProvisioningInput): Promise<OnboardingProvisioningResult> {
      let session: {
        id: string;
        user_id: string;
        org_id?: string | null;
        started_at?: string | null;
      } | null = null;

      if (input.sessionId) {
        const { data } = await db
          .from('onboarding_sessions')
          .select('id, user_id, org_id, started_at')
          .eq('id', input.sessionId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) fail('Onboarding session not found', 404);
        session = data;
      }

      const { data: memberships } = await db
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', userId);
      const existingOrgId = memberships?.[0]?.org_id as string | undefined;
      const retryingExistingSetup = Boolean(
        existingOrgId && session?.org_id === existingOrgId
      );
      if (existingOrgId && !retryingExistingSetup) {
        fail('User already belongs to an organization', 409);
      }

      let orgId = existingOrgId;
      if (!orgId) {
        const { data, error } = await db.rpc('provision_organization', {
          p_name: input.name,
          p_org_type: input.orgType,
          p_owner_user_id: userId,
          p_ein: input.ein?.trim() || null,
          p_modules: input.requestedModules,
        });
        if (error) fail(error.message, 500);
        orgId = data as string;
      }

      let portfolio: { id: string } | null = null;
      if (retryingExistingSetup) {
        const { data, error } = await db
          .from('portfolios')
          .select('id')
          .eq('org_id', orgId)
          .eq('owner_id', userId)
          .maybeSingle();
        if (error) fail(error.message, 500);
        portfolio = data;
      }

      if (!portfolio) {
        const { data, error } = await db
          .from('portfolios')
          .insert({
            org_id: orgId,
            owner_id: userId,
            name: input.name,
            settings: { base_currency: 'USD' },
          })
          .select('id')
          .single();
        if (error) {
          if (!retryingExistingSetup) {
            await db.from('organizations').delete().eq('id', orgId);
          }
          fail(error.message, 500);
        }
        portfolio = data;
      }

      if (!portfolio) {
        if (!retryingExistingSetup) {
          await db.from('organizations').delete().eq('id', orgId);
        }
        fail('Foundation portfolio could not be found or created', 500);
      }

      if (input.failAfterPortfolio) {
        await db.from('organizations').delete().eq('id', orgId);
        fail('Walkthrough fault: failed after portfolio creation', 500);
      }

      if (!retryingExistingSetup) {
        const { error } = await db.from('portfolio_members').insert({
          portfolio_id: portfolio.id,
          user_id: userId,
          role: 'owner',
        });
        if (error) {
          await db.from('organizations').delete().eq('id', orgId);
          fail(error.message, 500);
        }
      }

      const enabledModules: string[] = [];
      const moduleErrors: string[] = [];
      for (const moduleId of input.selectedModuleIds) {
        const result = await enableModule(db, orgId, moduleId, userId);
        if (result.success) enabledModules.push(...(result.enabledModules || [moduleId]));
        else moduleErrors.push(`${moduleId}: ${result.error || 'Unable to enable module'}`);
      }

      const setupErrors: string[] = [];
      if (session && input.sessionId) {
        const { data: profile, error: profileError } = await db
          .from('onboarding_profiles')
          .select('workflows')
          .eq('session_id', session.id)
          .maybeSingle();

        if (profileError) {
          setupErrors.push(`Foundation Blueprint: ${profileError.message}`);
        } else {
          const contextRows = contextRowsFromOnboardingProfile(profile, orgId, userId);
          if (contextRows.length > 0) {
            const { error } = await db
              .from('org_ai_context')
              .upsert(contextRows, { onConflict: 'org_id,context_key' });
            if (error) setupErrors.push(`Foundation Memory: ${error.message}`);
          }

          const viewRows = viewRowsFromOnboardingProfile(profile, orgId);
          if (viewRows.length > 0) {
            const { error } = await db
              .from('org_view_config')
              .upsert(viewRows, { onConflict: 'org_id,config_scope,scope_key' });
            if (error) setupErrors.push(`Views and vocabulary: ${error.message}`);
          }

          const workflowRows = workflowRowsFromOnboardingProfile(profile, orgId);
          if (workflowRows.length > 0) {
            const { error } = await db
              .from('org_workflow_config')
              .upsert(workflowRows, {
                onConflict: 'org_id,module,config_type,stage_key,config_key',
              });
            if (error) setupErrors.push(`Workflow configuration: ${error.message}`);
          }

          const customFieldRows = customFieldRowsFromOnboardingProfile(profile, orgId);
          if (customFieldRows.length > 0) {
            const { error } = await db
              .from('org_custom_field_definitions')
              .upsert(customFieldRows, { onConflict: 'org_id,entity_type,field_key' });
            if (error) setupErrors.push(`Custom fields: ${error.message}`);
          }

          const automationRows = automationRowsFromOnboardingProfile(
            profile,
            orgId,
            userId,
            session.id
          );
          if (automationRows.length > 0) {
            const { error } = await db
              .from('org_automation_rules')
              .upsert(automationRows, { onConflict: 'org_id,onboarding_session_id,name' });
            if (error) setupErrors.push(`Automations: ${error.message}`);
          }
        }
      }

      const provisioningHasErrors = moduleErrors.length > 0 || setupErrors.length > 0;
      if (session) {
        const { error } = await db
          .from('onboarding_sessions')
          .update(provisioningHasErrors
            ? { org_id: orgId, status: 'recommendations', completed_at: null }
            : {
                org_id: orgId,
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
          .eq('id', session.id)
          .eq('user_id', userId);
        if (error) fail(error.message, 500);

        if (session.started_at) {
          await db
            .from('onboarding_analytics')
            .update({
              total_duration_seconds: Math.floor(
                (Date.now() - new Date(session.started_at).getTime()) / 1000
              ),
              completed_successfully: !provisioningHasErrors,
            })
            .eq('session_id', session.id);
        }
      }

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
