import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { DecisionPayload, LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { checkWorkflowGate } from '@/lib/grants/workflow-config';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';

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

export type GrantWorkflowRow = {
  id: string;
  lifecycle_stage: string;
  org_id: string;
  purpose: string | null;
  internal_owner_id: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  grant_period_start: string | null;
  grant_period_end: string | null;
  risk_level: string | null;
  deliverables: string | null;
  reporting_frequency: string | null;
};

export type GrantLifecycleTransitionInput = {
  grantId: string;
  expectedFromStage: LifecycleStage;
  targetStage: LifecycleStage;
  reason?: string;
  decisionPayload?: DecisionPayload;
};

const GRANT_WORKFLOW_SELECT =
  'id, lifecycle_stage, org_id, purpose, internal_owner_id, requested_amount, ' +
  'approved_amount, grant_period_start, grant_period_end, risk_level, ' +
  'deliverables, reporting_frequency';

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

    async findWorkflowGrant(grantId: string) {
      return db
        .from('grants')
        .select(GRANT_WORKFLOW_SELECT)
        .eq('id', grantId)
        .eq('org_id', scope.orgId)
        .maybeSingle() as unknown as Promise<{
          data: GrantWorkflowRow | null;
          error: { message: string } | null;
        }>;
    },

    async findWorkflowGrants(grantIds: string[]) {
      return db
        .from('grants')
        .select(GRANT_WORKFLOW_SELECT)
        .eq('org_id', scope.orgId)
        .in('id', grantIds) as unknown as Promise<{
          data: GrantWorkflowRow[] | null;
          error: { message: string } | null;
        }>;
    },

    async checkWorkflowGate(
      grantId: string,
      fromStage: LifecycleStage,
      grant: GrantWorkflowRow
    ) {
      return checkWorkflowGate(
        db,
        scope.orgId,
        grantId,
        fromStage,
        grant as unknown as Record<string, unknown>
      );
    },

    async transitionLifecycle(input: GrantLifecycleTransitionInput) {
      return db.rpc('transition_grant_lifecycle', {
        p_grant_id: input.grantId,
        p_expected_org_id: scope.orgId,
        p_expected_from_stage: input.expectedFromStage,
        p_to_stage: input.targetStage,
        p_actor_id: scope.actorId,
        p_reason: input.reason ?? null,
        p_decision_payload: input.decisionPayload ?? null,
      });
    },

    async transitionLifecycleBatch(inputs: GrantLifecycleTransitionInput[]) {
      return db.rpc('transition_grant_lifecycle_batch', {
        p_expected_org_id: scope.orgId,
        p_actor_id: scope.actorId,
        p_transitions: inputs.map(input => ({
          grant_id: input.grantId,
          expected_from_stage: input.expectedFromStage,
          target_stage: input.targetStage,
          reason: input.reason ?? null,
          decision_payload: input.decisionPayload ?? null,
        })),
      });
    },

    async runLifecycleAutomation(input: {
      grantId: string;
      fromStage: LifecycleStage;
      toStage: LifecycleStage;
    }) {
      return runAutomationRulesForEvent(db, {
        orgId: scope.orgId,
        triggerType: 'grant_stage_change',
        entityType: 'grant',
        entityId: input.grantId,
        payload: {
          from_stage: input.fromStage,
          to_stage: input.toStage,
          actor_id: scope.actorId,
        },
      });
    },
  };
}
