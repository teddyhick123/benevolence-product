import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

type GrantRepositoryScope = Pick<OrgAccessContext, 'orgId'> & {
  actorId: string;
};

export type CreateGrantInput = {
  portfolioId: string;
  purpose: string;
  requestedAmount: number;
  investeeId?: string | null;
  newGrantee?: Record<string, unknown> | null;
  currency: string;
  grantType?: string | null;
  grantPeriodStart?: string | null;
  grantPeriodEnd?: string | null;
  lifecycleStage: string;
  internalOwnerId?: string | null;
  riskLevel?: string | null;
  reportingFrequency?: string | null;
  renewalEligible: boolean;
  workflowTemplateId?: string | null;
};

/** Elevated grant operations constrained to one already-authorized org. */
export function createGrantRepository(scope: GrantRepositoryScope) {
  const db = createElevatedClient();

  return {
    async findPortfolio(portfolioId: string) {
      return db
        .from('portfolios')
        .select('id, org_id')
        .eq('id', portfolioId)
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .maybeSingle();
    },

    async findOrganizationMember(userId: string) {
      return db
        .from('organization_members')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .maybeSingle();
    },

    async createWithFoundationRecords(input: CreateGrantInput) {
      return db.rpc('create_grant_with_foundation_records', {
        p_org_id: scope.orgId,
        p_portfolio_id: input.portfolioId,
        p_actor_id: scope.actorId,
        p_purpose: input.purpose,
        p_requested_amount: input.requestedAmount,
        p_investee_id: input.investeeId ?? null,
        p_new_grantee: input.newGrantee ?? null,
        p_currency: input.currency,
        p_grant_type: input.grantType ?? null,
        p_grant_period_start: input.grantPeriodStart ?? null,
        p_grant_period_end: input.grantPeriodEnd ?? null,
        p_lifecycle_stage: input.lifecycleStage,
        p_internal_owner_id: input.internalOwnerId ?? null,
        p_risk_level: input.riskLevel ?? null,
        p_reporting_frequency: input.reportingFrequency ?? null,
        p_renewal_eligible: input.renewalEligible,
        p_workflow_template_id: input.workflowTemplateId ?? null,
      });
    },
  };
}
