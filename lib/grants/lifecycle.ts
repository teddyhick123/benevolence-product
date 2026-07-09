// lib/grants/lifecycle.ts
//
// Canonical lifecycle state machine for grants.
// All stage transitions must go through canTransition / transitionGrant.
// Stages that require a grant_decisions record are listed in DECISION_REQUIRED_TRANSITIONS.

import { createAdminClient } from '@/lib/supabase';
import {
  canTransition,
  requiresDecision,
  type DecisionPayload,
  type LifecycleStage,
} from './lifecycle-shared';
import { checkWorkflowGate } from './workflow-config';
import { runAutomationRulesForEvent } from '@/lib/tasks/automation/dynamic-rules';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  DECISION_REQUIRED_TRANSITIONS,
  LIFECYCLE_STAGES,
  requiresDecision,
  type DecisionPayload,
  type LifecycleStage,
} from './lifecycle-shared';

export class InvalidTransitionError extends Error {
  constructor(from: LifecycleStage, to: LifecycleStage) {
    super(`Invalid lifecycle transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class DecisionRequiredError extends Error {
  constructor(from: LifecycleStage, to: LifecycleStage) {
    super(`Transition ${from} → ${to} requires a decision record`);
    this.name = 'DecisionRequiredError';
  }
}

export class GrantNotFoundError extends Error {
  constructor(grantId: string) {
    super(`Grant not found: ${grantId}`);
    this.name = 'GrantNotFoundError';
  }
}

export class GrantTransitionConflictError extends Error {
  constructor(grantId: string) {
    super(`Grant lifecycle changed before transition could be committed: ${grantId}`);
    this.name = 'GrantTransitionConflictError';
  }
}

export class WorkflowGateBlockedError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Transition blocked by workflow configuration: ${reasons.join('; ')}`);
    this.reasons = reasons;
    this.name = 'WorkflowGateBlockedError';
  }
}

type GrantWorkflowRow = {
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

/**
 * Transitions a grant to a new lifecycle stage.
 * Validates the transition, then calls an atomic RPC that optionally inserts
 * grant_decisions, updates grants.lifecycle_stage, and appends history.
 * Throws InvalidTransitionError or DecisionRequiredError on failure.
 */
export async function transitionGrant(
  grantId: string,
  toStage: LifecycleStage,
  actorId: string | null,
  reason?: string,
  decisionPayload?: DecisionPayload,
  expectedOrgId?: string
): Promise<void> {
  const db = createAdminClient();

  // Fetch current stage
  const { data: grantData, error: fetchErr } = await (db
    .from('grants')
    .select(
      'lifecycle_stage, org_id, purpose, internal_owner_id, requested_amount, ' +
      'approved_amount, grant_period_start, grant_period_end, risk_level, ' +
      'deliverables, reporting_frequency'
    )
    .eq('id', grantId)
    .maybeSingle() as unknown as Promise<{ data: GrantWorkflowRow | null; error: { message: string } | null }>);

  if (fetchErr) {
    throw new Error(fetchErr.message);
  }
  if (!grantData) {
    throw new GrantNotFoundError(grantId);
  }

  const grant = grantData;
  const fromStage = grant.lifecycle_stage as LifecycleStage;
  const orgId: string = grant.org_id;
  if (expectedOrgId && orgId !== expectedOrgId) {
    throw new GrantNotFoundError(grantId);
  }

  if (!canTransition(fromStage, toStage)) {
    throw new InvalidTransitionError(fromStage, toStage);
  }

  const gate = await checkWorkflowGate(db, orgId, grantId, fromStage, grant as Record<string, unknown>);
  if (gate.blocked) throw new WorkflowGateBlockedError(gate.reasons);

  if (requiresDecision(fromStage, toStage) && !decisionPayload) {
    throw new DecisionRequiredError(fromStage, toStage);
  }

  const { error: transitionErr } = await db.rpc('transition_grant_lifecycle', {
    p_grant_id: grantId,
    p_expected_org_id: orgId,
    p_expected_from_stage: fromStage,
    p_to_stage: toStage,
    p_actor_id: actorId,
    p_reason: reason ?? null,
    p_decision_payload: decisionPayload ?? null,
  });

  if (transitionErr) {
    if (transitionErr.message.includes('GRANT_NOT_FOUND')) {
      throw new GrantNotFoundError(grantId);
    }
    if (transitionErr.message.includes('GRANT_TRANSITION_CONFLICT')) {
      throw new GrantTransitionConflictError(grantId);
    }
    throw new Error(`Failed to transition grant lifecycle: ${transitionErr.message}`);
  }

  try {
    await runAutomationRulesForEvent(db, {
      orgId,
      triggerType: 'grant_stage_change',
      entityType: 'grant',
      entityId: grantId,
      payload: {
        from_stage: fromStage,
        to_stage: toStage,
        actor_id: actorId,
      },
    });
  } catch (automationErr) {
    console.error('Grant transition automation failed:', automationErr);
  }
}
