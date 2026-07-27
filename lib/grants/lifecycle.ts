// lib/grants/lifecycle.ts
//
// Canonical lifecycle state machine for grants.
// All stage transitions must go through canTransition / transitionGrant.
// Stages that require a grant_decisions record are listed in DECISION_REQUIRED_TRANSITIONS.

import {
  canTransition,
  requiresDecision,
  type DecisionPayload,
  type LifecycleStage,
} from './lifecycle-shared';
import { createGrantRepository } from '@/lib/api/repositories/grants';

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

/**
 * Transitions a grant to a new lifecycle stage.
 * Validates the transition, then calls an atomic RPC that optionally inserts
 * grant_decisions, updates grants.lifecycle_stage, and appends history.
 * Throws InvalidTransitionError or DecisionRequiredError on failure.
 */
export async function transitionGrant(
  grantId: string,
  toStage: LifecycleStage,
  actorId: string,
  reason?: string,
  decisionPayload?: DecisionPayload,
  expectedOrgId?: string
): Promise<void> {
  if (!expectedOrgId) {
    throw new GrantNotFoundError(grantId);
  }
  const repository = createGrantRepository({ orgId: expectedOrgId, actorId });

  // Fetch current stage
  const { data: grantData, error: fetchErr } = await repository.findWorkflowGrant(grantId);

  if (fetchErr) {
    throw new Error(fetchErr.message);
  }
  if (!grantData) {
    throw new GrantNotFoundError(grantId);
  }

  const grant = grantData;
  const fromStage = grant.lifecycle_stage as LifecycleStage;
  if (grant.org_id !== expectedOrgId) {
    throw new GrantNotFoundError(grantId);
  }

  if (!canTransition(fromStage, toStage)) {
    throw new InvalidTransitionError(fromStage, toStage);
  }

  const gate = await repository.checkWorkflowGate(grantId, fromStage, grant);
  if (gate.blocked) throw new WorkflowGateBlockedError(gate.reasons);

  if (requiresDecision(fromStage, toStage) && !decisionPayload) {
    throw new DecisionRequiredError(fromStage, toStage);
  }

  const { error: transitionErr } = await repository.transitionLifecycle({
    grantId,
    expectedFromStage: fromStage,
    targetStage: toStage,
    reason,
    decisionPayload,
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
    await repository.runLifecycleAutomation({
      grantId,
      fromStage,
      toStage,
    });
  } catch (automationErr) {
    console.error('Grant transition automation failed:', automationErr);
  }
}
